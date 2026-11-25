//go:build linux

package grader

import (
	"encoding/json"
	"os"
	"strconv"
	"strings"
	"syscall"
)

// reexecWithoutCredentials replaces the process image (same PID) with a fresh
// copy of this binary whose initial environment no longer contains the
// credentials. os.Unsetenv only edits Go's copy of the environment; the
// block the kernel shows in /proc/<pid>/environ is the one passed to execve,
// and it lives until the next execve. The credentials travel to the new image
// through an inherited pipe (fd number in secretFDEnv) that is read and
// closed at start-up. It returns only on failure.
func reexecWithoutCredentials(apiURL, token string) error {
	r, w, err := os.Pipe()
	if err != nil {
		return err
	}
	b, _ := json.Marshal(credentials{URL: apiURL, Token: token})
	if _, err := w.Write(b); err != nil { // < PIPE_BUF*16: never blocks
		r.Close()
		w.Close()
		return err
	}
	w.Close()
	rfd := r.Fd()
	if _, _, e := syscall.Syscall(syscall.SYS_FCNTL, rfd, syscall.F_SETFD, 0); e != 0 {
		r.Close()
		return e
	}
	env := []string{secretFDEnv + "=" + strconv.Itoa(int(rfd))}
	for _, kv := range os.Environ() {
		k, _, _ := strings.Cut(kv, "=")
		if k == "CPPATLAS_TOKEN" || k == "CPPATLAS_API_URL" || k == secretFDEnv {
			continue
		}
		env = append(env, kv)
	}
	err = syscall.Exec("/proc/self/exe", os.Args, env)
	r.Close()
	return err
}
