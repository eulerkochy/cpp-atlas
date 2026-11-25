//go:build linux

package sandbox

import (
	"bytes"
	"os"
	"sort"
	"strings"
	"testing"
	"time"
)

// The test binary doubles as the sandbox helper, as the grader binary does.
func TestMain(m *testing.M) {
	RunHelperIfRequested(os.Args)
	os.Exit(m.Run())
}

func TestSeccompFilterAssembles(t *testing.T) {
	f, err := buildSeccompFilter()
	if err != nil {
		t.Fatal(err)
	}
	if len(f) < 10 || len(f) > 4096 {
		t.Fatalf("filter has %d instructions", len(f))
	}
	if f[len(f)-1].Code != bpfRET|bpfK || f[len(f)-1].K != retKillProcess {
		t.Fatalf("last instruction %+v", f[len(f)-1])
	}
}

func newManager(t *testing.T) *Manager {
	t.Helper()
	m, err := New(Options{Logf: t.Logf, Masks: DefaultMasks})
	if err != nil {
		t.Skipf("sandbox unavailable: %v", err)
	}
	t.Logf("info: %+v", m.Info())
	return m
}

func sh(script string) Cmd {
	return Cmd{
		Path: "/bin/sh", Args: []string{"-c", script},
		Env:     []string{"PATH=/usr/bin:/bin"},
		Dir:     "/",
		Timeout: 10 * time.Second,
		Limits:  []Limit{{Name: "core", Value: 0}, {Name: "nofile", Value: 64}},
		Seccomp: seccompInTests(),
	}
}

// seccompInTests: CPPATLAS_TEST_SECCOMP=0 runs the suite without the filter,
// for user-mode emulators (qemu-user answers PR_SET_SECCOMP with EINVAL, so
// a foreign-arch run can only exercise everything else).
func seccompInTests() bool { return os.Getenv("CPPATLAS_TEST_SECCOMP") != "0" }

func TestRunExitCodes(t *testing.T) {
	m := newManager(t)
	var out bytes.Buffer
	c := sh("echo hello; echo err >&2; exit 3")
	c.Output = &out
	st := m.Run(c)
	if st.StartErr != nil || !st.Exited || st.ExitCode != 3 || out.String() != "hello\nerr\n" {
		t.Fatalf("%+v out=%q", st, out.String())
	}
	st = m.Run(sh("kill -SEGV $$"))
	if st.Signal != 11 || st.SignalName != "SIGSEGV" {
		t.Fatalf("%+v", st)
	}
}

func TestRunTimeoutKillsTree(t *testing.T) {
	m := newManager(t)
	c := sh("(setsid sleep 1000 &) ; sleep 1000 & sleep 1000")
	c.Timeout = 500 * time.Millisecond
	t0 := time.Now()
	st := m.Run(c)
	if !st.TimedOut || st.CleanupErr != nil || time.Since(t0) > 5*time.Second {
		t.Fatalf("%+v after %s", st, time.Since(t0))
	}
	if v := m.victims(); m.info.Mode != modeNamespaces && len(v) != 0 {
		t.Fatalf("survivors: %v", v)
	}
}

func TestRunOrphansSwept(t *testing.T) {
	m := newManager(t)
	// The command exits immediately, leaving a detached grandchild behind.
	st := m.Run(sh("(setsid sleep 1000 </dev/null >/dev/null 2>&1 &); exit 0"))
	if !st.Exited || st.CleanupErr != nil {
		t.Fatalf("%+v", st)
	}
	if v := m.victims(); m.info.Mode != modeNamespaces && len(v) != 0 {
		t.Fatalf("survivors: %v", v)
	}
}

func TestRunOutputFlood(t *testing.T) {
	m := newManager(t)
	var n countWriter
	c := sh("yes spam")
	c.Output = &n
	c.KillAfterOutput = 4 << 20
	st := m.Run(c)
	if !st.OutputFlood || st.TimedOut || n < 4<<20 || n > 6<<20 {
		t.Fatalf("%+v written=%d", st, n)
	}
}

func TestRunForkBomb(t *testing.T) {
	m := newManager(t)
	c := sh("b() { b | b & }; b")
	c.Timeout = 2 * time.Second
	c.Pids = 64
	c.Limits = append(c.Limits, Limit{Name: "nproc", Value: 64})
	t0 := time.Now()
	st := m.Run(c)
	if st.StartErr != nil || st.CleanupErr != nil || time.Since(t0) > 10*time.Second {
		t.Fatalf("%+v after %s", st, time.Since(t0))
	}
	if v := m.victims(); m.info.Mode != modeNamespaces && len(v) != 0 {
		t.Fatalf("survivors: %v", v)
	}
}

func TestRunIsolation(t *testing.T) {
	if err := HardenSelf(); err != nil {
		t.Fatal(err)
	}
	m := newManager(t)
	var out bytes.Buffer
	c := sh("id -u; cat /proc/1/environ >/dev/null 2>&1 && echo ENVIRON-READABLE; ls /sys/class/net; unshare -n true 2>/dev/null && echo UNSHARE-OK; exit 0")
	c.Output = &out
	st := m.Run(c)
	if !st.Exited {
		t.Fatalf("%+v", st)
	}
	s := out.String()
	t.Logf("mode %s:\n%s", m.info.Mode, s)
	if strings.Contains(s, "UNSHARE-OK") {
		t.Error("namespace creation allowed")
	}
	if strings.Contains(s, "ENVIRON-READABLE") {
		t.Error("/proc/1/environ readable")
	}
	if m.info.Mode == modeNamespaces {
		if strings.TrimSpace(strings.SplitN(s, "\n", 2)[0]) != "10001" {
			t.Error("not running as the sandbox uid")
		}
	}
}

// TestCommandSeesOnlyStdFds: no descriptor of the sandbox machinery (spec
// pipe, init status pipe, ...) may reach the command (finding A4: the init's
// status pipe used to be inherited as fd 4).
func TestCommandSeesOnlyStdFds(t *testing.T) {
	m := newManager(t)
	var out bytes.Buffer
	// ls's own directory fd shows up as a link to /proc/<pid>/fd.
	c := sh("ls -l /proc/self/fd/; for i in 3 4 5 6 7 8 9; do { true >&$i; } 2>/dev/null && echo SHELL-SEES-FD-$i; done; exit 0")
	c.Output = &out
	st := m.Run(c)
	if !st.Exited || st.ExitCode != 0 {
		t.Fatalf("%+v %s", st, out.String())
	}
	var fds []string
	for _, line := range strings.Split(out.String(), "\n") {
		f := strings.Fields(line)
		if strings.HasPrefix(line, "SHELL-SEES-FD") {
			t.Errorf("%s", line)
		}
		if len(f) >= 3 && f[len(f)-2] == "->" {
			if tgt := f[len(f)-1]; strings.HasPrefix(tgt, "/proc/") && strings.HasSuffix(tgt, "/fd") {
				continue
			}
			fds = append(fds, f[len(f)-3])
		}
	}
	sort.Strings(fds)
	if strings.Join(fds, ",") != "0,1,2" {
		t.Errorf("command sees fds %v (mode %s):\n%s", fds, m.info.Mode, out.String())
	}
}

// TestSeccompLive: the filter as the kernel applies it.
func TestSeccompLive(t *testing.T) {
	if !seccompInTests() {
		t.Skip("CPPATLAS_TEST_SECCOMP=0")
	}
	m := newManager(t)
	var out bytes.Buffer
	c := sh(`bash -c 'exec 3<>/dev/tcp/127.0.0.1/9' 2>&1 | sed 's/^/TCP: /'; ` +
		`setarch linux32 true 2>&1 | sed 's/^/LINUX32: /'; setarch "$(uname -m)" -R true && echo NORANDOMIZE-OK; ` +
		`dmesg >/dev/null 2>&1 || echo SYSLOG-DENIED; exit 0`)
	c.Env = append(c.Env, "LC_ALL=C")
	c.Output = &out
	st := m.Run(c)
	s := out.String()
	t.Logf("mode %s:\n%s", m.info.Mode, s)
	if !st.Exited {
		t.Fatalf("%+v", st)
	}
	if !strings.Contains(s, "TCP: ") || !strings.Contains(s, "Address family not supported") {
		t.Error("an AF_INET socket could be created")
	}
	if !strings.Contains(s, "LINUX32: ") {
		t.Error("personality(PER_LINUX32) allowed")
	}
	// Docker's default profile (mode A) refuses ADDR_NO_RANDOMIZE itself;
	// our filter allows it (sanitizer re-exec), which shows in namespace mode.
	if m.info.Mode == modeNamespaces && !strings.Contains(s, "NORANDOMIZE-OK") {
		t.Error("personality(ADDR_NO_RANDOMIZE) refused")
	}
	if !strings.Contains(s, "SYSLOG-DENIED") {
		t.Error("syslog allowed")
	}
}

// TestNamespaceView: mode B's /dev, /dev/shm and /proc masks.
func TestNamespaceView(t *testing.T) {
	m := newManager(t)
	if m.info.Mode != modeNamespaces {
		t.Skip("namespace mode only")
	}
	var out bytes.Buffer
	c := sh(`echo "DEV: $(ls /dev | tr '\n' ' ')"; echo "SHM: $(ls -A /dev/shm | wc -l)"; ` +
		`echo x > /dev/shm/a && echo SHM-WRITABLE; echo x > /dev/null && echo NULL-OK; head -c 4 /dev/urandom | wc -c | sed 's/^/URANDOM: /'; ` +
		`echo "KCORE: $(wc -c < /proc/kcore)"; echo "KALLSYMS: $(wc -c < /proc/kallsyms)"; ` +
		`grep -E ' /proc/sys | /dev ' /proc/self/mounts | sed 's/^/MNT: /'; touch /dev/evil 2>/dev/null && echo DEV-WRITABLE; exit 0`)
	c.Output = &out
	st := m.Run(c)
	s := out.String()
	t.Logf("\n%s", s)
	if !st.Exited {
		t.Fatalf("%+v", st)
	}
	if !strings.Contains(s, "DEV: fd full null random shm stderr stdin stdout tty urandom zero \n") {
		t.Error("unexpected /dev contents")
	}
	for _, want := range []string{"SHM: 0", "SHM-WRITABLE", "NULL-OK", "URANDOM: 4", "KCORE: 0", "KALLSYMS: 0"} {
		if !strings.Contains(s, want+"\n") {
			t.Errorf("missing %q", want)
		}
	}
	if strings.Contains(s, "DEV-WRITABLE") {
		t.Error("/dev writable")
	}
	// The last entry for a mount point is the one on top (the real /dev is
	// listed too, covered).
	top := map[string]string{}
	for _, line := range strings.Split(s, "\n") {
		if f := strings.Fields(line); len(f) > 3 && f[0] == "MNT:" {
			top[f[2]] = line
		}
	}
	for _, mp := range []string{"/dev", "/proc/sys"} {
		if !strings.Contains(top[mp], " ro,") {
			t.Errorf("%s not read-only: %q", mp, top[mp])
		}
	}
}

// TestKillAll: the shutdown path kills a running command and its detached
// descendants and refuses new commands.
func TestKillAll(t *testing.T) {
	m := newManager(t)
	done := make(chan Status, 1)
	go func() {
		c := sh("(setsid sleep 1000 </dev/null >/dev/null 2>&1 &); sleep 1000")
		c.Timeout = 60 * time.Second
		done <- m.Run(c)
	}()
	time.Sleep(300 * time.Millisecond)
	t0 := time.Now()
	if err := m.KillAll(); err != nil {
		t.Fatal(err)
	}
	select {
	case st := <-done:
		if st.Exited || st.Signal != 9 {
			t.Errorf("%+v", st)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not return after KillAll")
	}
	if v := m.victims(); m.info.Mode != modeNamespaces && len(v) != 0 {
		t.Fatalf("survivors: %v", v)
	}
	if st := m.Run(sh("true")); st.StartErr == nil {
		t.Error("Run after KillAll started a command")
	}
	t.Logf("KillAll took %s", time.Since(t0))
}

type countWriter int64

func (c *countWriter) Write(p []byte) (int, error) { *c += countWriter(len(p)); return len(p), nil }
