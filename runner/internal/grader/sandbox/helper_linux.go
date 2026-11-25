//go:build linux

package sandbox

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"unsafe"
)

// Argument (argv[1]) values that turn the grader binary into a helper.
const (
	InitArg  = "__sandbox-init"
	ExecArg  = "__sandbox-exec"
	ProbeArg = "__sandbox-probe"
)

// execSpec is sent to the helpers on fd 3 as JSON.
type execSpec struct {
	Path    string   `json:"path"`
	Argv    []string `json:"argv"`
	Env     []string `json:"env"`
	Dir     string   `json:"dir"`
	Limits  []Limit  `json:"limits"`
	Seccomp bool     `json:"seccomp"`

	// __sandbox-init only.
	UID      int      `json:"uid"`
	GID      int      `json:"gid"`
	Masks    []string `json:"masks"`
	TmpSize  string   `json:"tmp_size"`
	Hostname string   `json:"hostname"`
}

// initStatus is written by __sandbox-init on fd 4.
type initStatus struct {
	Started  bool   `json:"started"`
	Exited   bool   `json:"exited"`
	Code     int    `json:"code"`
	Signal   int    `json:"signal"`
	MaxRSSKB int64  `json:"max_rss_kb"`
	Error    string `json:"error,omitempty"`
}

var rlimitByName = map[string]int{
	"as":       syscall.RLIMIT_AS,
	"data":     syscall.RLIMIT_DATA,
	"cpu":      syscall.RLIMIT_CPU,
	"nproc":    6, // RLIMIT_NPROC
	"fsize":    syscall.RLIMIT_FSIZE,
	"nofile":   syscall.RLIMIT_NOFILE,
	"core":     syscall.RLIMIT_CORE,
	"stack":    syscall.RLIMIT_STACK,
	"memlock":  8,  // RLIMIT_MEMLOCK
	"msgqueue": 12, // RLIMIT_MSGQUEUE
}

func readSpec(fd uintptr) (*execSpec, error) {
	f := os.NewFile(fd, "spec")
	if f == nil {
		return nil, fmt.Errorf("no spec fd")
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, 4<<20))
	if err != nil {
		return nil, err
	}
	var s execSpec
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, err
	}
	if s.Path == "" || len(s.Argv) == 0 {
		return nil, fmt.Errorf("empty command")
	}
	return &s, nil
}

func helperFatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "cppatlas-sandbox: "+format+"\n", args...)
	os.Exit(127)
}

// ExecMain is "__sandbox-exec": runs as the sandbox uid, applies limits and
// execve()s the command. It never returns.
func ExecMain() {
	runtime.LockOSThread()
	spec, err := readSpec(3)
	if err != nil {
		helperFatal("bad spec: %v", err)
	}
	if os.Geteuid() == 0 || os.Getuid() == 0 || os.Getegid() == 0 {
		helperFatal("refusing to run a sandboxed command as root")
	}
	// The kernel OOM killer must pick us before the grader.
	_ = os.WriteFile("/proc/self/oom_score_adj", []byte("1000"), 0)

	for _, l := range spec.Limits {
		res, ok := rlimitByName[l.Name]
		if !ok {
			helperFatal("unknown rlimit %q", l.Name)
		}
		var cur syscall.Rlimit
		_ = syscall.Getrlimit(res, &cur)
		v := l.Value
		if cur.Max != ^uint64(0) && v > cur.Max {
			v = cur.Max // cannot raise the hard limit unprivileged
		}
		if err := syscall.Setrlimit(res, &syscall.Rlimit{Cur: v, Max: v}); err != nil {
			helperFatal("setrlimit %s: %v", l.Name, err)
		}
	}
	// RLIMIT_FSIZE: fail the write (EFBIG) instead of killing with SIGXFSZ,
	// so a large trace or log cannot turn a passing stage into a crash.
	signal.Ignore(syscall.SIGXFSZ)

	if err := setNoNewPrivs(); err != nil {
		helperFatal("no_new_privs: %v", err)
	}
	if spec.Seccomp {
		if err := installSeccomp(); err != nil {
			helperFatal("seccomp: %v", err)
		}
	}
	if spec.Dir != "" {
		if err := syscall.Chdir(spec.Dir); err != nil {
			helperFatal("chdir: %v", err)
		}
	}
	// Nothing but stdin/stdout/stderr may reach the program: every other
	// descriptor (an init status pipe, anything a future change forgets to
	// mark close-on-exec) is closed by the kernel at execve.
	if err := cloexecFrom(3); err != nil {
		helperFatal("close-on-exec: %v", err)
	}
	// Start the program with an empty signal mask.
	var empty [2]uint32
	syscall.RawSyscall6(syscall.SYS_RT_SIGPROCMASK, 2 /* SIG_SETMASK */, uintptr(unsafe.Pointer(&empty)), 0, 8, 0, 0)
	err = syscall.Exec(spec.Path, spec.Argv, spec.Env)
	name := spec.Path
	if i := strings.LastIndexByte(name, '/'); i >= 0 {
		name = name[i+1:]
	}
	helperFatal("cannot start %s: %v", name, err)
}

// ProbeMain is "__sandbox-probe": started with the namespace clone flags to
// check they are permitted. Exits 0.
func ProbeMain() { os.Exit(0) }

const (
	sysCloseRange     = 436 // same number on amd64 and arm64
	closeRangeCloexec = 1 << 2
)

// cloexecFrom marks every descriptor >= lo close-on-exec. The descriptors
// are not closed here (the Go runtime may own some, e.g. its epoll fd); the
// kernel closes them at execve. close_range(CLOSE_RANGE_CLOEXEC) needs Linux
// 5.11; older kernels fall back to /proc/self/fd, then to a bounded loop.
func cloexecFrom(lo int) error {
	if _, _, e := syscall.RawSyscall(sysCloseRange, uintptr(lo), ^uintptr(0)>>32, closeRangeCloexec); e == 0 {
		return nil
	}
	if d, err := os.Open("/proc/self/fd"); err == nil {
		names, err := d.Readdirnames(-1)
		dfd := int(d.Fd())
		if err == nil {
			for _, n := range names {
				if fd, err := strconv.Atoi(n); err == nil && fd >= lo && fd != dfd {
					syscall.CloseOnExec(fd)
				}
			}
			d.Close() // opened close-on-exec
			return nil
		}
		d.Close()
	}
	var rl syscall.Rlimit
	max := 65536
	if syscall.Getrlimit(syscall.RLIMIT_NOFILE, &rl) == nil && rl.Cur < uint64(max) {
		max = int(rl.Cur)
	}
	for fd := lo; fd < max; fd++ {
		syscall.CloseOnExec(fd)
	}
	return nil
}

// InitMain is "__sandbox-init": PID 1 of a fresh PID namespace, root, in fresh
// mount/net/ipc/uts namespaces. It prepares the mount view, starts
// __sandbox-exec as the sandbox uid, reaps everything, kills whatever is left
// when the command ends and reports the command's status on fd 4.
func InitMain() {
	runtime.LockOSThread()
	// fd 4 is the status pipe back to the supervisor. It must not be inherited
	// by the command (which could write a forged status into it).
	syscall.CloseOnExec(4)
	status := os.NewFile(4, "status")
	report := func(st initStatus) {
		if status != nil {
			b, _ := json.Marshal(st)
			status.Write(append(b, '\n'))
			status.Close()
		}
	}
	fail := func(format string, args ...any) {
		report(initStatus{Error: fmt.Sprintf(format, args...)})
		os.Exit(0)
	}
	spec, err := readSpec(3)
	if err != nil {
		fail("bad spec: %v", err)
	}
	if os.Getpid() != 1 {
		fail("not pid 1 of a new pid namespace")
	}
	if err := setupMounts(spec); err != nil {
		fail("mount setup: %v", err)
	}
	if spec.Hostname != "" {
		_ = syscall.Sethostname([]byte(spec.Hostname))
	}

	pr, pw, err := os.Pipe()
	if err != nil {
		fail("pipe: %v", err)
	}
	self, err := os.Executable()
	if err != nil {
		fail("executable: %v", err)
	}
	attr := &syscall.ProcAttr{
		Dir:   "/",
		Env:   []string{},
		Files: []uintptr{0, 1, 2, pr.Fd()},
		Sys: &syscall.SysProcAttr{
			Setpgid:    true,
			Credential: &syscall.Credential{Uid: uint32(spec.UID), Gid: uint32(spec.GID), Groups: []uint32{}},
			Pdeathsig:  syscall.SIGKILL,
		},
	}
	child, err := syscall.ForkExec(self, []string{"cppatlas-sandbox", ExecArg}, attr)
	pr.Close()
	if err != nil {
		pw.Close()
		fail("start: %v", err)
	}
	inner := *spec
	inner.Masks, inner.Hostname = nil, ""
	b, _ := json.Marshal(&inner)
	pw.Write(b)
	pw.Close()

	st := initStatus{Started: true}
	for {
		var ws syscall.WaitStatus
		var ru syscall.Rusage
		pid, err := syscall.Wait4(-1, &ws, 0, &ru)
		if err == syscall.EINTR {
			continue
		}
		if err != nil {
			st.Error = "lost the command: " + err.Error()
			break
		}
		if pid == child {
			if ws.Exited() {
				st.Exited, st.Code = true, ws.ExitStatus()
			} else if ws.Signaled() {
				st.Signal = int(ws.Signal())
			}
			st.MaxRSSKB = ru.Maxrss
			break
		}
	}
	// Everything else in this namespace dies now (kill(-1) from the
	// namespace's init reaches every process in it).
	syscall.Kill(-1, syscall.SIGKILL)
	for {
		var ws syscall.WaitStatus
		_, err := syscall.Wait4(-1, &ws, 0, nil)
		if err == syscall.EINTR {
			continue
		}
		if err != nil {
			break
		}
	}
	report(st)
	os.Exit(0)
}

func setupMounts(spec *execSpec) error {
	const (
		msRdonly  = syscall.MS_RDONLY
		msNosuid  = syscall.MS_NOSUID
		msNodev   = syscall.MS_NODEV
		msNoexec  = syscall.MS_NOEXEC
		msRemount = syscall.MS_REMOUNT
		msBind    = syscall.MS_BIND
		msRec     = syscall.MS_REC
		msPrivate = syscall.MS_PRIVATE
	)
	// Nothing we do here may propagate back to the host's mount namespace.
	if err := syscall.Mount("", "/", "", msRec|msPrivate, ""); err != nil {
		return fmt.Errorf("make / private: %w", err)
	}
	// A /proc that only shows this PID namespace, with other users' processes
	// (our root init) invisible.
	if err := syscall.Mount("proc", "/proc", "proc", msNosuid|msNodev|msNoexec, "hidepid=invisible"); err != nil {
		if err2 := syscall.Mount("proc", "/proc", "proc", msNosuid|msNodev|msNoexec, "hidepid=2"); err2 != nil {
			return fmt.Errorf("mount /proc: %w", err2)
		}
	}
	if err := setupDev(); err != nil {
		return fmt.Errorf("minimal /dev: %w", err)
	}
	if err := maskProc(); err != nil {
		return fmt.Errorf("mask /proc: %w", err)
	}
	// A sysfs of the new network namespace (only "lo" under /sys/class/net),
	// read-only. Not fatal: the namespace itself is what isolates.
	if err := syscall.Mount("sysfs", "/sys", "sysfs", msRdonly|msNosuid|msNodev|msNoexec, ""); err != nil {
		fmt.Fprintf(os.Stderr, "cppatlas-sandbox: note: fresh /sys: %v\n", err)
	}
	size := spec.TmpSize
	if size == "" {
		size = "64m"
	}
	if err := syscall.Mount("tmpfs", "/tmp", "tmpfs", msNosuid|msNodev, "size="+size+",mode=1777"); err != nil {
		return fmt.Errorf("mount /tmp: %w", err)
	}
	for _, m := range spec.Masks {
		fi, err := os.Lstat(m)
		if err != nil || !fi.IsDir() {
			continue // absent, or a symlink (masked through its target)
		}
		if err := syscall.Mount("tmpfs", m, "tmpfs", msRdonly|msNosuid|msNodev|msNoexec, "size=4k,mode=0755"); err != nil {
			return fmt.Errorf("mask %s: %w", m, err)
		}
	}
	// The root filesystem is read-only for the command; /work, /tmp, /proc and
	// /dev are separate mounts and keep their own flags.
	if err := syscall.Mount("", "/", "", msRemount|msBind|msRdonly|msNosuid|msNodev, ""); err != nil {
		return fmt.Errorf("remount / read-only: %w", err)
	}
	return nil
}

// devNodes are the only device nodes a sandboxed command sees.
const oPath = 0x200000 // O_PATH (same value on amd64 and arm64)

var devNodes = []struct {
	name         string
	major, minor uint32
}{{"null", 1, 3}, {"zero", 1, 5}, {"full", 1, 7}, {"random", 1, 8}, {"urandom", 1, 9}, {"tty", 5, 0}}

// setupDev replaces /dev with a small read-only tmpfs holding only devNodes
// (mknod'd, or bind-mounted from the real nodes when mknod is refused), the
// usual /proc/self/fd symlinks and a private, empty /dev/shm.
func setupDev() error {
	// Keep a handle on the real nodes for the bind fallback.
	orig := map[string]int{}
	for _, d := range devNodes {
		if fd, err := syscall.Open("/dev/"+d.name, oPath|syscall.O_CLOEXEC, 0); err == nil {
			orig[d.name] = fd
		}
	}
	defer func() {
		for _, fd := range orig {
			syscall.Close(fd)
		}
	}()
	if err := syscall.Mount("tmpfs", "/dev", "tmpfs", syscall.MS_NOSUID|syscall.MS_NOEXEC, "size=64k,nr_inodes=64,mode=0755"); err != nil {
		return err
	}
	for _, d := range devNodes {
		p := "/dev/" + d.name
		dev := int((d.major << 8) | (d.minor & 0xff) | ((d.minor &^ 0xff) << 12))
		if err := syscall.Mknod(p, syscall.S_IFCHR|0o666, dev); err == nil {
			syscall.Chmod(p, 0o666) // mknod honours the umask
			continue
		}
		fd, ok := orig[d.name]
		if !ok {
			return fmt.Errorf("%s: no device node to bind", p)
		}
		f, err := os.OpenFile(p, os.O_CREATE|os.O_WRONLY, 0o666)
		if err != nil {
			return err
		}
		f.Close()
		if err := syscall.Mount(fmt.Sprintf("/proc/self/fd/%d", fd), p, "", syscall.MS_BIND, ""); err != nil {
			return fmt.Errorf("bind %s: %w", p, err)
		}
	}
	for name, target := range map[string]string{"fd": "/proc/self/fd", "stdin": "/proc/self/fd/0", "stdout": "/proc/self/fd/1", "stderr": "/proc/self/fd/2"} {
		if err := os.Symlink(target, "/dev/"+name); err != nil {
			return err
		}
	}
	if err := os.Mkdir("/dev/shm", 0o755); err != nil {
		return err
	}
	if err := syscall.Mount("tmpfs", "/dev/shm", "tmpfs", syscall.MS_NOSUID|syscall.MS_NODEV|syscall.MS_NOEXEC, "size=64m,mode=1777"); err != nil {
		return err
	}
	return syscall.Mount("", "/dev", "", syscall.MS_REMOUNT|syscall.MS_RDONLY|syscall.MS_NOSUID|syscall.MS_NOEXEC, "")
}

// /proc entries hidden the way docker hides them: files are covered with
// /dev/null, directories with an empty read-only tmpfs, and the writable
// kernel knobs are made read-only.
var (
	procMaskFiles = []string{"/proc/kcore", "/proc/kallsyms", "/proc/keys", "/proc/key-users", "/proc/timer_list",
		"/proc/timer_stats", "/proc/sched_debug", "/proc/latency_stats", "/proc/kpagecount", "/proc/kpageflags",
		"/proc/kpagecgroup", "/proc/sysrq-trigger", "/proc/config.gz", "/proc/vmallocinfo", "/proc/slabinfo"}
	procMaskDirs = []string{"/proc/acpi", "/proc/asound", "/proc/scsi", "/proc/driver"}
	procReadOnly = []string{"/proc/sys", "/proc/bus", "/proc/fs", "/proc/irq"}
)

func maskProc() error {
	for _, p := range procMaskFiles {
		if fi, err := os.Lstat(p); err != nil || fi.IsDir() {
			continue
		}
		if err := syscall.Mount("/dev/null", p, "", syscall.MS_BIND, ""); err != nil {
			return fmt.Errorf("%s: %w", p, err)
		}
	}
	for _, p := range procMaskDirs {
		if fi, err := os.Lstat(p); err != nil || !fi.IsDir() {
			continue
		}
		if err := syscall.Mount("tmpfs", p, "tmpfs", syscall.MS_RDONLY|syscall.MS_NOSUID|syscall.MS_NODEV|syscall.MS_NOEXEC, "size=4k,mode=0555"); err != nil {
			return fmt.Errorf("%s: %w", p, err)
		}
	}
	for _, p := range procReadOnly {
		if fi, err := os.Lstat(p); err != nil || !fi.IsDir() {
			continue
		}
		if err := syscall.Mount(p, p, "", syscall.MS_BIND|syscall.MS_REC, ""); err != nil {
			return fmt.Errorf("%s: %w", p, err)
		}
		if err := syscall.Mount("", p, "", syscall.MS_REMOUNT|syscall.MS_BIND|syscall.MS_RDONLY|syscall.MS_NOSUID|syscall.MS_NODEV|syscall.MS_NOEXEC, ""); err != nil {
			return fmt.Errorf("%s read-only: %w", p, err)
		}
	}
	return nil
}
