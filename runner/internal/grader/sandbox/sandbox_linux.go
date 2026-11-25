//go:build linux

package sandbox

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

const (
	modeNamespaces = "namespaces"
	modeSetuid     = "setuid"
	modeRlimits    = "rlimits"

	nsFlags = syscall.CLONE_NEWPID | syscall.CLONE_NEWNS | syscall.CLONE_NEWNET | syscall.CLONE_NEWIPC | syscall.CLONE_NEWUTS

	prSetChildSubreaper = 36
	prSetDumpable       = 4
)

// Manager runs sandboxed commands one at a time. It owns the process-wide
// child reaper: the grader must not use os/exec while a Manager exists.
type Manager struct {
	opts Options
	self string
	info Info
	cg   *cgroups
	rp   *reaper
	seq  int
	mu   sync.Mutex
	// containerEvents is our own cgroup's memory.events (docker mode), read
	// to detect OOM kills made by the container's memory limit.
	containerEvents string

	// The command currently running (for KillAll, which must not wait for mu).
	curMu   sync.Mutex
	curPid  int
	curCg   *cgroup
	curDone chan struct{}
	closed  bool
}

var errClosed = errors.New("sandbox: shut down")

// KillAll kills the running command and everything it started, waits
// (bounded) for it to be reaped, and refuses further commands. It is the
// grader's last act before exiting on its overall deadline or on SIGTERM, so
// nothing it started outlives it even if the container or VM is not torn
// down promptly.
func (m *Manager) KillAll() error {
	m.curMu.Lock()
	m.closed = true
	pid, cg, done := m.curPid, m.curCg, m.curDone
	m.curMu.Unlock()
	if pid > 0 {
		m.killTree(pid, cg)
	}
	if m.cg != nil {
		// Any leaf left under our sandbox cgroup (there should be none).
		if ents, err := os.ReadDir(m.cg.base); err == nil {
			for _, e := range ents {
				if e.IsDir() {
					(&cgroup{path: filepath.Join(m.cg.base, e.Name()), fd: -1}).kill()
				}
			}
		}
	}
	if done != nil {
		select {
		case <-done:
		case <-time.After(5 * time.Second):
		}
	}
	if m.info.Mode != modeNamespaces {
		return m.sweep(3 * time.Second)
	}
	return nil
}

type exitInfo struct {
	ws syscall.WaitStatus
	ru syscall.Rusage
}

// reaper is the only caller of wait4 in the process. As PID 1 (docker mode)
// or as a child subreaper we inherit every orphan; they are reaped and
// dropped, registered pids get their status delivered.
type reaper struct {
	mu      sync.Mutex
	waiters map[int]chan exitInfo
	kick    chan struct{}
}

var (
	reaperOnce sync.Once
	theReaper  *reaper
)

// newReaper returns the process-wide reaper (there must be exactly one wait4
// caller, however many Managers exist).
func newReaper() *reaper {
	reaperOnce.Do(func() {
		theReaper = &reaper{waiters: map[int]chan exitInfo{}, kick: make(chan struct{}, 1)}
		go theReaper.loop()
	})
	return theReaper
}

func (r *reaper) loop() {
	for {
		var ws syscall.WaitStatus
		var ru syscall.Rusage
		pid, err := syscall.Wait4(-1, &ws, 0, &ru)
		switch {
		case err == syscall.EINTR:
			continue
		case err == syscall.ECHILD:
			select {
			case <-r.kick:
			case <-time.After(250 * time.Millisecond):
			}
			continue
		case err != nil:
			time.Sleep(10 * time.Millisecond)
			continue
		}
		r.mu.Lock()
		ch := r.waiters[pid]
		delete(r.waiters, pid)
		r.mu.Unlock()
		if ch != nil {
			ch <- exitInfo{ws, ru}
		}
	}
}

// start forks under the reaper lock so the child cannot be reaped before it
// is registered.
func (r *reaper) start(path string, argv []string, attr *syscall.ProcAttr) (int, chan exitInfo, error) {
	runtime.LockOSThread() // Pdeathsig is tied to the forking thread; keep it alive
	defer runtime.UnlockOSThread()
	r.mu.Lock()
	defer r.mu.Unlock()
	pid, err := syscall.ForkExec(path, argv, attr)
	if err != nil {
		return 0, nil, err
	}
	ch := make(chan exitInfo, 1)
	r.waiters[pid] = ch
	select {
	case r.kick <- struct{}{}:
	default:
	}
	return pid, ch, nil
}

// New probes what isolation is available and returns a Manager.
func New(opts Options) (*Manager, error) {
	if opts.Logf == nil {
		opts.Logf = func(string, ...any) {}
	}
	if opts.UID == 0 {
		opts.UID, opts.GID = 10001, 10001
	}
	self, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("sandbox: own executable: %w", err)
	}
	m := &Manager{opts: opts, self: self}
	m.info.PID1 = os.Getpid() == 1
	if !m.info.PID1 {
		// Orphans of sandboxed commands are re-parented to us, not to the
		// real init, so they can be found and killed.
		syscall.RawSyscall(syscall.SYS_PRCTL, prSetChildSubreaper, 1, 0)
	}
	m.rp = newReaper()

	if os.Geteuid() == 0 {
		m.info.UID, m.info.GID = opts.UID, opts.GID
		if err := m.probeNamespaces(); err == nil {
			m.info.Mode = modeNamespaces
			cg, note := setupCgroups(opts.Logf)
			m.cg = cg
			if cg != nil {
				m.info.Cgroup = cg.base
			} else {
				m.info.CgroupNote = note
			}
		} else if opts.RequireIsolation {
			return nil, fmt.Errorf("sandbox: namespaces unavailable (%v); refusing to run without a private network namespace", err)
		} else {
			m.info.Mode = modeSetuid
			m.info.Notes = append(m.info.Notes, "namespaces unavailable: "+err.Error())
		}
	} else {
		if opts.RequireIsolation {
			return nil, errors.New("sandbox: isolation required but the grader is not root")
		}
		m.info.Mode = modeRlimits
		m.info.UID, m.info.GID = os.Getuid(), os.Getgid()
		if !m.info.PID1 {
			m.info.Notes = append(m.info.Notes, "not PID 1: leftovers are found through the subreaper tree")
		}
	}
	if m.info.Mode != modeNamespaces && isCgroup2(cgroupRoot) {
		if _, err := os.Stat(filepath.Join(cgroupRoot, "memory.events")); err == nil {
			m.containerEvents = filepath.Join(cgroupRoot, "memory.events")
		}
	}
	m.info.Seccomp = true
	return m, nil
}

// Info describes the probed sandbox.
func (m *Manager) Info() Info { return m.info }

func (m *Manager) probeNamespaces() error {
	devnull, err := os.Open("/dev/null")
	if err != nil {
		return err
	}
	defer devnull.Close()
	attr := &syscall.ProcAttr{
		Dir:   "/",
		Env:   []string{},
		Files: []uintptr{devnull.Fd(), devnull.Fd(), devnull.Fd()},
		Sys:   &syscall.SysProcAttr{Cloneflags: nsFlags, Pdeathsig: syscall.SIGKILL},
	}
	pid, ch, err := m.rp.start(m.self, []string{"cppatlas-sandbox", ProbeArg}, attr)
	if err != nil {
		return err
	}
	select {
	case ei := <-ch:
		if !ei.ws.Exited() || ei.ws.ExitStatus() != 0 {
			return fmt.Errorf("probe exited with %v", ei.ws)
		}
		return nil
	case <-time.After(10 * time.Second):
		syscall.Kill(pid, syscall.SIGKILL)
		return errors.New("probe timed out")
	}
}

// Run runs one command to completion and cleans up after it.
func (m *Manager) Run(cmd Cmd) (st Status) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.curMu.Lock()
	closed := m.closed
	m.curMu.Unlock()
	if closed {
		st.StartErr = errClosed
		return
	}
	m.seq++
	start := time.Now()
	defer func() { st.Wall = time.Since(start) }()

	spec := execSpec{
		Path: cmd.Path, Argv: append([]string{cmd.Path}, cmd.Args...), Env: cmd.Env, Dir: cmd.Dir,
		Limits: cmd.Limits, Seccomp: cmd.Seccomp,
	}
	if spec.Env == nil {
		spec.Env = []string{}
	}
	outR, outW, err := os.Pipe()
	if err != nil {
		st.StartErr = err
		return
	}
	defer outR.Close()
	specR, specW, err := os.Pipe()
	if err != nil {
		outW.Close()
		st.StartErr = err
		return
	}
	devnull, err := os.Open("/dev/null")
	if err != nil {
		outW.Close()
		specR.Close()
		specW.Close()
		st.StartErr = err
		return
	}
	files := []uintptr{devnull.Fd(), outW.Fd(), outW.Fd(), specR.Fd()}
	sys := &syscall.SysProcAttr{Pdeathsig: syscall.SIGKILL}
	helper := ExecArg
	var statusR, statusW *os.File
	var cg *cgroup

	switch m.info.Mode {
	case modeNamespaces:
		helper = InitArg
		spec.UID, spec.GID = m.info.UID, m.info.GID
		spec.Masks = m.opts.Masks
		spec.TmpSize = m.opts.TmpSize
		spec.Hostname = "sandbox"
		statusR, statusW, err = os.Pipe()
		if err != nil {
			st.StartErr = err
			return
		}
		defer statusR.Close()
		files = append(files, statusW.Fd())
		sys.Cloneflags = nsFlags
		if m.cg != nil {
			g, err := m.cg.create(fmt.Sprintf("cmd-%d-%d", os.Getpid(), m.seq), cmd.MemoryBytes, cmd.Pids)
			if err != nil {
				m.opts.Logf("sandbox: cgroup create failed, continuing without: %v", err)
			} else {
				cg = g
				sys.UseCgroupFD = true
				sys.CgroupFD = g.fd
			}
		}
	case modeSetuid:
		sys.Setpgid = true
		sys.Credential = &syscall.Credential{Uid: uint32(m.info.UID), Gid: uint32(m.info.GID), Groups: []uint32{}}
	default:
		sys.Setpgid = true
	}

	oomBefore := int64(0)
	if m.containerEvents != "" {
		oomBefore = readOOMKills(m.containerEvents)
	}
	attr := &syscall.ProcAttr{Dir: "/", Env: []string{}, Files: files, Sys: sys}
	argv := []string{"cppatlas-sandbox", helper}
	pid, ch, err := m.rp.start(m.self, argv, attr)
	if err != nil && cg != nil {
		// clone3/CLONE_INTO_CGROUP unsupported: start, then move it (its
		// children inherit the cgroup; the namespace bounds the race anyway).
		sys.UseCgroupFD, sys.CgroupFD = false, 0
		pid, ch, err = m.rp.start(m.self, argv, attr)
		if err == nil {
			if aerr := cg.addPID(pid); aerr != nil {
				m.opts.Logf("sandbox: could not move command into its cgroup: %v", aerr)
			}
		}
	}
	devnull.Close()
	outW.Close()
	specR.Close()
	if statusW != nil {
		statusW.Close()
	}
	if err != nil {
		specW.Close()
		if cg != nil {
			cg.remove()
		}
		st.StartErr = fmt.Errorf("start sandboxed command: %w", err)
		return
	}
	done := make(chan struct{})
	defer close(done)
	m.curMu.Lock()
	m.curPid, m.curCg, m.curDone = pid, cg, done
	closed = m.closed
	m.curMu.Unlock()
	defer func() {
		m.curMu.Lock()
		m.curPid, m.curCg, m.curDone = 0, nil, nil
		m.curMu.Unlock()
	}()
	if closed {
		m.killTree(pid, cg) // KillAll raced with the start
	}
	b, _ := json.Marshal(&spec)
	specW.Write(b)
	specW.Close()

	var timedOut, flood atomic.Bool
	var killOnce sync.Once
	kill := func() {
		killOnce.Do(func() { m.killTree(pid, cg) })
	}

	// Output: everything is read (so the command never blocks on a full
	// pipe); the consumer keeps what it wants.
	var total atomic.Int64
	readerDone := make(chan struct{})
	go func() {
		defer close(readerDone)
		buf := make([]byte, 64<<10)
		for {
			n, err := outR.Read(buf)
			if n > 0 {
				t := total.Add(int64(n))
				if !flood.Load() {
					if cmd.Output != nil {
						cmd.Output.Write(buf[:n])
					}
					if cmd.KillAfterOutput > 0 && t > cmd.KillAfterOutput {
						flood.Store(true)
						kill()
					}
				}
			}
			if err != nil {
				return
			}
		}
	}()

	var timer *time.Timer
	if cmd.Timeout > 0 {
		timer = time.AfterFunc(cmd.Timeout, func() {
			timedOut.Store(true)
			kill()
		})
	}
	ei := <-ch
	if timer != nil {
		timer.Stop()
	}

	// Cleanup: nothing the command started may survive it.
	switch m.info.Mode {
	case modeNamespaces:
		// The namespace died with its init. The cgroup catches anything that
		// somehow is not in the namespace.
		if cg != nil {
			cg.kill()
		}
	default:
		syscall.Kill(-pid, syscall.SIGKILL)
		st.CleanupErr = m.sweep(5 * time.Second)
	}
	select {
	case <-readerDone:
	case <-time.After(2 * time.Second):
		// A writer we could not see still holds the pipe; stop reading.
		outR.Close()
		<-readerDone
		if st.CleanupErr == nil && m.info.Mode != modeNamespaces {
			st.CleanupErr = errors.New("output pipe still open after cleanup")
		}
	}

	st.OutputBytes = total.Load()
	st.TimedOut = timedOut.Load()
	st.OutputFlood = flood.Load()
	st.MaxRSSKB = ei.ru.Maxrss

	if m.info.Mode == modeNamespaces {
		var is initStatus
		raw, _ := io.ReadAll(io.LimitReader(statusR, 64<<10))
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &is); err != nil {
				is.Error = "bad init status"
			}
		}
		switch {
		case is.Error != "" && !is.Started:
			st.StartErr = errors.New("sandbox init: " + is.Error)
		case is.Started && is.Exited:
			st.Exited, st.ExitCode = true, is.Code
		case is.Started && is.Signal != 0:
			st.Signal = is.Signal
		default:
			// Init itself was killed (our timeout / flood kill) or lost.
			if ei.ws.Signaled() {
				st.Signal = int(ei.ws.Signal())
			} else {
				st.Signal = int(syscall.SIGKILL)
			}
		}
		if is.MaxRSSKB > 0 {
			st.MaxRSSKB = is.MaxRSSKB
		}
		if cg != nil {
			st.OOMKilled = cg.oomKills() > 0
			if err := cg.remove(); err != nil && st.CleanupErr == nil {
				st.CleanupErr = err
			}
		}
	} else {
		switch {
		case ei.ws.Exited():
			st.Exited, st.ExitCode = true, ei.ws.ExitStatus()
		case ei.ws.Signaled():
			st.Signal = int(ei.ws.Signal())
		}
		if m.containerEvents != "" {
			st.OOMKilled = readOOMKills(m.containerEvents) > oomBefore
		}
	}
	if st.Signal != 0 {
		st.SignalName = SignalName(st.Signal)
	}
	return st
}

// killTree is the immediate kill on timeout / output flood.
func (m *Manager) killTree(pid int, cg *cgroup) {
	switch m.info.Mode {
	case modeNamespaces:
		syscall.Kill(pid, syscall.SIGKILL) // init: the kernel kills the namespace
		if cg != nil {
			cg.kill()
		}
	default:
		syscall.Kill(-pid, syscall.SIGKILL)
		syscall.Kill(pid, syscall.SIGKILL)
		if m.info.Mode == modeRlimits && m.info.PID1 {
			// As the container's init, kill(-1) reaches every other process
			// in the container (same uid), including setsid() escapees. The
			// kernel walks the task list under tasklist_lock, and a fork
			// racing with it fails because its parent has SIGKILL pending.
			syscall.Kill(-1, syscall.SIGKILL)
		}
	}
}

// sweep kills processes left behind by a command until none remain.
func (m *Manager) sweep(limit time.Duration) error {
	deadline := time.Now().Add(limit)
	for i := 0; ; i++ {
		victims := m.victims()
		if len(victims) == 0 {
			return nil
		}
		if m.info.Mode == modeRlimits && m.info.PID1 {
			syscall.Kill(-1, syscall.SIGKILL)
		} else {
			for _, v := range victims {
				syscall.Kill(v, syscall.SIGKILL)
			}
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%d sandboxed process(es) could not be killed", len(victims))
		}
		d := time.Duration(i+1) * 2 * time.Millisecond
		if d > 50*time.Millisecond {
			d = 50 * time.Millisecond
		}
		time.Sleep(d)
	}
}

type procEntry struct {
	pid, ppid int
	state     byte
}

func listProcs() []procEntry {
	d, err := os.Open("/proc")
	if err != nil {
		return nil
	}
	defer d.Close()
	names, _ := d.Readdirnames(-1)
	out := make([]procEntry, 0, len(names))
	for _, n := range names {
		pid, err := strconv.Atoi(n)
		if err != nil {
			continue
		}
		b, err := os.ReadFile("/proc/" + n + "/stat")
		if err != nil {
			continue
		}
		s := string(b)
		i := strings.LastIndexByte(s, ')')
		if i < 0 || i+4 > len(s) {
			continue
		}
		f := strings.Fields(s[i+1:])
		if len(f) < 2 {
			continue
		}
		ppid, _ := strconv.Atoi(f[1])
		out = append(out, procEntry{pid: pid, ppid: ppid, state: f[0][0]})
	}
	return out
}

func realUID(pid int) int {
	b, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/status")
	if err != nil {
		return -1
	}
	for _, line := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(line, "Uid:") {
			f := strings.Fields(line)
			if len(f) >= 2 {
				n, _ := strconv.Atoi(f[1])
				return n
			}
		}
	}
	return -1
}

// victims lists live (non-zombie) processes that belong to sandboxed commands.
func (m *Manager) victims() []int {
	self := os.Getpid()
	procs := listProcs()
	var out []int
	switch {
	case m.info.Mode == modeSetuid:
		for _, p := range procs {
			if p.pid != self && p.state != 'Z' && realUID(p.pid) == m.info.UID {
				out = append(out, p.pid)
			}
		}
	case m.info.PID1:
		for _, p := range procs {
			if p.pid != self && p.state != 'Z' {
				out = append(out, p.pid)
			}
		}
	default:
		children := map[int][]int{}
		for _, p := range procs {
			children[p.ppid] = append(children[p.ppid], p.pid)
		}
		state := map[int]byte{}
		for _, p := range procs {
			state[p.pid] = p.state
		}
		queue := append([]int(nil), children[self]...)
		for len(queue) > 0 {
			p := queue[0]
			queue = queue[1:]
			if state[p] != 'Z' {
				out = append(out, p)
			}
			queue = append(queue, children[p]...)
		}
	}
	return out
}

var signalNames = map[int]string{
	1: "SIGHUP", 2: "SIGINT", 3: "SIGQUIT", 4: "SIGILL", 5: "SIGTRAP", 6: "SIGABRT", 7: "SIGBUS",
	8: "SIGFPE", 9: "SIGKILL", 10: "SIGUSR1", 11: "SIGSEGV", 12: "SIGUSR2", 13: "SIGPIPE",
	14: "SIGALRM", 15: "SIGTERM", 24: "SIGXCPU", 25: "SIGXFSZ", 31: "SIGSYS",
}

// SignalName returns "SIGSEGV" style names (Linux numbering).
func SignalName(n int) string {
	if s, ok := signalNames[n]; ok {
		return s
	}
	return "signal " + strconv.Itoa(n)
}

// ------------------------------------------------------- supervisor helpers

// HardenSelf makes the grader process non-dumpable: processes of the same
// uid (docker mode) can then neither ptrace it nor read /proc/<pid>/environ,
// mem or fd/.
func HardenSelf() error {
	if _, _, e := syscall.RawSyscall(syscall.SYS_PRCTL, prSetDumpable, 0, 0); e != 0 {
		return e
	}
	return nil
}

// PrewarmThreads makes the Go runtime create n OS threads now, so a later
// pids-cgroup exhaustion by a fork bomb cannot leave it unable to create one.
func PrewarmThreads(n int) {
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			runtime.LockOSThread()
			time.Sleep(20 * time.Millisecond)
			runtime.UnlockOSThread()
			wg.Done()
		}()
	}
	wg.Wait()
}

// NetworkInterfaces lists interfaces other than loopback visible to us.
func NetworkInterfaces() []string {
	ents, err := os.ReadDir("/sys/class/net")
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range ents {
		if e.Name() != "lo" {
			out = append(out, e.Name())
		}
	}
	return out
}

// SetOOMScoreAdj sets our own oom_score_adj (-1000 needs root).
func SetOOMScoreAdj(v int) error {
	return os.WriteFile("/proc/self/oom_score_adj", []byte(strconv.Itoa(v)), 0)
}

// EnsureTmpfs mounts a tmpfs at dir unless dir already is a mount point.
func EnsureTmpfs(dir, size string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	var a, b syscall.Stat_t
	if syscall.Stat(dir, &a) == nil && syscall.Stat(filepath.Dir(dir), &b) == nil && a.Dev != b.Dev {
		return nil // already a mount point
	}
	return syscall.Mount("tmpfs", dir, "tmpfs", syscall.MS_NOSUID|syscall.MS_NODEV, "size="+size+",mode=0755")
}

// FreeBytes returns the space available to unprivileged writers on the
// filesystem holding path.
func FreeBytes(path string) (int64, bool) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(path, &st); err != nil {
		return 0, false
	}
	return int64(st.Bavail) * int64(st.Bsize), true
}

// CPUQuota returns the cgroup v2 CPU quota in CPUs (0 = unlimited/unknown).
func CPUQuota() float64 {
	b, err := os.ReadFile(filepath.Join(cgroupRoot, "cpu.max"))
	if err != nil {
		return 0
	}
	f := strings.Fields(string(b))
	if len(f) != 2 || f[0] == "max" {
		return 0
	}
	q, err1 := strconv.ParseFloat(f[0], 64)
	p, err2 := strconv.ParseFloat(f[1], 64)
	if err1 != nil || err2 != nil || p <= 0 {
		return 0
	}
	return q / p
}

// IsHelper reports whether argv selects one of the in-sandbox helpers, and
// runs it (never returning) if so.
func RunHelperIfRequested(args []string) {
	if len(args) < 2 {
		return
	}
	switch args[1] {
	case InitArg:
		InitMain()
	case ExecArg:
		ExecMain()
	case ProbeArg:
		ProbeMain()
	}
}
