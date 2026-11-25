package docker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"cppatlas.com/runner/internal/protocol"
	"cppatlas.com/runner/internal/runs"
)

// The test binary doubles as a fake docker CLI when CPPATLAS_FAKE_DOCKER=1.
// Every invocation appends its argv (JSON) to $FAKE_DOCKER_DIR/calls.
func TestMain(m *testing.M) {
	if os.Getenv("CPPATLAS_FAKE_DOCKER") == "1" {
		os.Exit(fakeDocker(os.Args[1:]))
	}
	os.Exit(m.Run())
}

func fakeDocker(args []string) int {
	dir := os.Getenv("FAKE_DOCKER_DIR")
	f, _ := os.OpenFile(filepath.Join(dir, "calls"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	line, _ := json.Marshal(args)
	f.Write(append(line, '\n'))
	f.Close()
	switch args[0] {
	case "kill", "rm":
		name := args[len(args)-1]
		if b, err := os.ReadFile(filepath.Join(dir, name+".pid")); err == nil {
			pid, _ := strconv.Atoi(string(b))
			syscall.Kill(pid, syscall.SIGKILL)
			os.Remove(filepath.Join(dir, name+".pid"))
		}
		return 0
	case "ps":
		fmt.Println(os.Getenv("FAKE_DOCKER_PS"))
		return 0
	case "run":
	default:
		return 1
	}
	name := args[slices.Index(args, "--name")+1]
	os.WriteFile(filepath.Join(dir, name+".pid"), []byte(strconv.Itoa(os.Getpid())), 0o600)
	var job protocol.Job
	if err := json.NewDecoder(os.Stdin).Decode(&job); err != nil {
		fmt.Fprintln(os.Stderr, "bad job", err)
		return 3
	}
	res := protocol.Result{RunID: job.RunID, Status: protocol.ResultCompleted, Passed: true, Challenge: job.Challenge}
	fmt.Fprintln(os.Stderr, strings.Repeat("log line\n", 10000))
	switch os.Getenv("FAKE_DOCKER_MODE") {
	case "ok":
		json.NewEncoder(os.Stdout).Encode(res)
	case "exit1":
		json.NewEncoder(os.Stdout).Encode(res)
		return 1
	case "overflow":
		os.Stdout.Write([]byte(`{"run_id":"` + strings.Repeat("x", 5<<20) + `"}`))
	case "invalid":
		fmt.Println("this is not json")
	case "two":
		json.NewEncoder(os.Stdout).Encode(res)
		json.NewEncoder(os.Stdout).Encode(res)
	case "empty":
	case "oom":
		return 137
	case "noimage":
		fmt.Fprintln(os.Stderr, "Unable to find image")
		return 125
	case "hang":
		time.Sleep(time.Hour)
	}
	return 0
}

func setup(t *testing.T, mode string) (*Backend, string) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("CPPATLAS_FAKE_DOCKER", "1")
	t.Setenv("FAKE_DOCKER_DIR", dir)
	t.Setenv("FAKE_DOCKER_MODE", mode)
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	b := New(Config{DockerPath: exe, Image: "cppatlas-grader:test", MaxStdoutBytes: 1 << 20,
		KillGrace: 2 * time.Second, Instance: "test"},
		slog.New(slog.NewTextHandler(io.Discard, nil)))
	return b, dir
}

func calls(t *testing.T, dir string) [][]string {
	t.Helper()
	data, _ := os.ReadFile(filepath.Join(dir, "calls"))
	var out [][]string
	for _, l := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		if l == "" {
			continue
		}
		var a []string
		json.Unmarshal([]byte(l), &a)
		out = append(out, a)
	}
	return out
}

func job() protocol.Job {
	return protocol.Job{RunID: "AbC-123_xyz", Challenge: "vector", Stages: []int{1},
		Files: map[string]string{"include/my/vector.hpp": "x"}, Limits: protocol.DefaultLimits()}
}

func TestRunArgs(t *testing.T) {
	b := New(Config{}, nil)
	got := b.RunArgs("cppatlas-run-x")
	want := []string{"run", "--rm", "-i", "--name", "cppatlas-run-x", "--label", "cppatlas.runner=default",
		"--network", "none", "--read-only", "--user", "10001:10001", "--cap-drop", "ALL",
		"--security-opt", "no-new-privileges", "--pids-limit", "256", "--memory", "3g", "--memory-swap", "3g",
		"--cpus", "2", "--env", "CPPATLAS_RLIMIT_NPROC=off", "--ulimit", "nofile=1024:1024", "--ulimit", "core=0",
		"--tmpfs", "/work:rw,exec,nosuid,nodev,size=1g,uid=10001,gid=10001,mode=0700",
		"--tmpfs", "/tmp:rw,nosuid,nodev,size=64m",
		"cppatlas-grader:dev"}
	if !slices.Equal(got, want) {
		t.Fatalf("argv\n got %q\nwant %q", got, want)
	}
	b = New(Config{Runtime: "runsc", Memory: "1g", ExtraArgs: []string{"--env", "A=1"}, Command: []string{"grader", "--json"}}, nil)
	got = b.RunArgs("n")
	s := strings.Join(got, " ")
	for _, frag := range []string{"--runtime runsc", "--memory 1g --memory-swap 1g", "--env A=1 cppatlas-grader:dev grader --json"} {
		if !strings.Contains(s, frag) {
			t.Fatalf("missing %q in %s", frag, s)
		}
	}
	if !strings.HasSuffix(s, "cppatlas-grader:dev grader --json") {
		t.Fatal(s)
	}
}

func TestRunOK(t *testing.T) {
	for _, mode := range []string{"ok", "exit1"} {
		t.Run(mode, func(t *testing.T) {
			b, dir := setup(t, mode)
			res, err := b.Run(context.Background(), job())
			if err != nil {
				t.Fatal(err)
			}
			if res.RunID != "AbC-123_xyz" || !res.Passed {
				t.Fatalf("%+v", res)
			}
			c := calls(t, dir)
			if c[0][0] != "run" || !slices.Contains(c[0], "cppatlas-run-AbC-123_xyz") || c[0][len(c[0])-1] != "cppatlas-grader:test" {
				t.Fatalf("calls %q", c)
			}
			if len(b.live) != 0 {
				t.Fatal("still tracked")
			}
		})
	}
}

func TestRunFailures(t *testing.T) {
	cases := map[string]string{
		"overflow": runs.CodeGraderExited,
		"invalid":  runs.CodeGraderExited,
		"two":      runs.CodeGraderExited,
		"empty":    runs.CodeGraderExited,
		"oom":      runs.CodeSandboxKilled,
		"noimage":  runs.CodeBackendUnavailable,
	}
	for mode, code := range cases {
		t.Run(mode, func(t *testing.T) {
			b, dir := setup(t, mode)
			res, err := b.Run(context.Background(), job())
			var be *runs.BackendError
			if res != nil || !errors.As(err, &be) || be.Code != code {
				t.Fatalf("got %+v %v", res, err)
			}
			// A failed run is followed by a defensive rm -f.
			c := calls(t, dir)
			last := c[len(c)-1]
			if !slices.Equal(last, []string{"rm", "-f", "cppatlas-run-AbC-123_xyz"}) {
				t.Fatalf("last call %q", last)
			}
		})
	}
}

func TestRunTimeoutKills(t *testing.T) {
	b, dir := setup(t, "hang")
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := b.Run(ctx, job())
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err %v", err)
	}
	if time.Since(start) > 15*time.Second {
		t.Fatalf("took %s", time.Since(start))
	}
	var sawKill, sawRm bool
	for _, c := range calls(t, dir) {
		if slices.Equal(c, []string{"kill", "cppatlas-run-AbC-123_xyz"}) {
			sawKill = true
		}
		if slices.Equal(c, []string{"rm", "-f", "cppatlas-run-AbC-123_xyz"}) {
			sawRm = true
		}
	}
	if !sawKill || !sawRm {
		t.Fatalf("kill=%v rm=%v calls=%q", sawKill, sawRm, calls(t, dir))
	}
}

func TestRunCancelledBeforeStart(t *testing.T) {
	b, dir := setup(t, "ok")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := b.Run(ctx, job()); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if len(calls(t, dir)) != 0 {
		t.Fatal("docker invoked")
	}
}

func TestInvalidRunID(t *testing.T) {
	b, dir := setup(t, "ok")
	j := job()
	j.RunID = "x; rm -rf /"
	if _, err := b.Run(context.Background(), j); err == nil {
		t.Fatal("accepted")
	}
	if len(calls(t, dir)) != 0 {
		t.Fatal("docker invoked")
	}
}

func TestCloseKillsLive(t *testing.T) {
	b, dir := setup(t, "hang")
	errc := make(chan error, 1)
	go func() { _, err := b.Run(context.Background(), job()); errc <- err }()
	deadline := time.Now().Add(5 * time.Second)
	for {
		if _, err := os.Stat(filepath.Join(dir, "cppatlas-run-AbC-123_xyz.pid")); err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("run did not start")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if err := b.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-errc:
		var be *runs.BackendError
		if !errors.As(err, &be) {
			t.Fatalf("err %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("run not terminated by Close")
	}
}

func TestCleanup(t *testing.T) {
	b, dir := setup(t, "ok")
	t.Setenv("FAKE_DOCKER_PS", "abc123\ndef456")
	n, err := b.Cleanup(context.Background())
	if err != nil || n != 2 {
		t.Fatalf("%d %v", n, err)
	}
	c := calls(t, dir)
	if !slices.Equal(c[0], []string{"ps", "-aq", "--filter", "label=cppatlas.runner=test"}) ||
		!slices.Equal(c[1], []string{"rm", "-f", "abc123", "def456"}) {
		t.Fatalf("%q", c)
	}
}

func TestBuffers(t *testing.T) {
	c := &capBuffer{max: 4}
	c.Write([]byte("ab"))
	c.Write([]byte("cdef"))
	if string(c.Bytes()) != "abcd" || !c.overflow || c.n != 6 {
		t.Fatalf("%q %v", c.Bytes(), c.overflow)
	}
	tb := &tailBuffer{max: 4}
	tb.Write([]byte("ab"))
	tb.Write([]byte("cdef"))
	if tb.String() != "cdef" {
		t.Fatal(tb.String())
	}
	tb.Write([]byte("123456789"))
	if tb.String() != "6789" {
		t.Fatal(tb.String())
	}
}

// Real end-to-end against a local grader image, if present.
func TestRealGraderImage(t *testing.T) {
	img := os.Getenv("CPPATLAS_E2E_IMAGE")
	if img == "" {
		t.Skip("set CPPATLAS_E2E_IMAGE=cppatlas-grader:dev to run against real docker")
	}
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("no docker")
	}
	b := New(Config{Image: img}, slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug})))
	src := os.Getenv("CPPATLAS_E2E_SOURCE")
	j := job()
	j.Stages = []int{1, 2}
	if src != "" {
		data, err := os.ReadFile(src)
		if err != nil {
			t.Fatal(err)
		}
		j.Files["include/my/vector.hpp"] = string(data)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	res, err := b.Run(ctx, j)
	if err != nil {
		t.Fatal(err)
	}
	out, _ := json.MarshalIndent(res, "", "  ")
	t.Logf("result: %s", out)
}
