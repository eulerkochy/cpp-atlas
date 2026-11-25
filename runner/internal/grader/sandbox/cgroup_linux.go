//go:build linux

package sandbox

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const cgroupRoot = "/sys/fs/cgroup"
const cgroup2Magic = 0x63677270

// cgroups manages per-command cgroup v2 leaves under base. Only used when the
// grader is root (namespace mode); in docker mode the container's own cgroup
// (docker --memory/--pids-limit) is the limit and is merely read.
type cgroups struct {
	base string
}

func isCgroup2(path string) bool {
	var st syscall.Statfs_t
	if err := syscall.Statfs(path, &st); err != nil {
		return false
	}
	return st.Type == cgroup2Magic
}

// ownCgroup returns this process's cgroup v2 path ("/" for the root).
func ownCgroup() (string, error) {
	b, err := os.ReadFile("/proc/self/cgroup")
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(line, "0::") {
			return strings.TrimSpace(line[3:]), nil
		}
	}
	return "", errors.New("no cgroup v2 entry in /proc/self/cgroup")
}

func writeFile(path, val string) error {
	f, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		return err
	}
	_, err = f.WriteString(val)
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	return err
}

// setupCgroups probes cgroup v2 and prepares a delegated subtree. It returns
// (nil, reason) when cgroups cannot be used; callers then fall back to
// rlimits (plus, on Fly, the VM's own memory as the outer bound).
func setupCgroups(logf func(string, ...any)) (*cgroups, string) {
	if !isCgroup2(cgroupRoot) {
		// Root inside a microVM may have to mount it itself.
		if err := syscall.Mount("cgroup2", cgroupRoot, "cgroup2", syscall.MS_NOSUID|syscall.MS_NODEV|syscall.MS_NOEXEC, ""); err != nil {
			return nil, "cgroup2 not mounted and mount failed: " + err.Error()
		}
		if !isCgroup2(cgroupRoot) {
			return nil, "cgroup2 not available"
		}
	}
	own, err := ownCgroup()
	if err != nil {
		return nil, err.Error()
	}
	parent := filepath.Join(cgroupRoot, filepath.Clean("/"+own))
	ctrl, err := os.ReadFile(filepath.Join(parent, "cgroup.controllers"))
	if err != nil {
		return nil, "read cgroup.controllers: " + err.Error()
	}
	have := map[string]bool{}
	for _, c := range strings.Fields(string(ctrl)) {
		have[c] = true
	}
	if !have["memory"] || !have["pids"] {
		return nil, "memory/pids controllers not available (have: " + strings.TrimSpace(string(ctrl)) + ")"
	}
	if parent != cgroupRoot {
		// "No internal processes": move ourselves to a leaf before enabling
		// controllers for children of our cgroup.
		sup := filepath.Join(parent, "supervisor")
		if err := os.Mkdir(sup, 0o755); err != nil && !os.IsExist(err) {
			return nil, "mkdir supervisor cgroup: " + err.Error()
		}
		if err := writeFile(filepath.Join(sup, "cgroup.procs"), strconv.Itoa(os.Getpid())); err != nil {
			return nil, "move supervisor: " + err.Error()
		}
	}
	if err := writeFile(filepath.Join(parent, "cgroup.subtree_control"), "+memory +pids"); err != nil {
		if !errors.Is(err, syscall.EBUSY) {
			return nil, "enable controllers: " + err.Error()
		}
		// The root of a cgroup namespace (docker --privileged) is not exempt
		// from "no internal processes": move every process of our cgroup
		// into a leaf, then retry.
		sup := filepath.Join(parent, "supervisor")
		if err := os.Mkdir(sup, 0o755); err != nil && !os.IsExist(err) {
			return nil, "mkdir supervisor cgroup: " + err.Error()
		}
		procs, _ := os.ReadFile(filepath.Join(parent, "cgroup.procs"))
		for _, pid := range strings.Fields(string(procs)) {
			_ = writeFile(filepath.Join(sup, "cgroup.procs"), pid)
		}
		if err := writeFile(filepath.Join(parent, "cgroup.subtree_control"), "+memory +pids"); err != nil {
			return nil, "enable controllers: " + err.Error()
		}
	}
	base := filepath.Join(parent, "cppatlas-sandbox")
	if err := os.Mkdir(base, 0o755); err != nil && !os.IsExist(err) {
		return nil, "mkdir sandbox cgroup: " + err.Error()
	}
	if err := writeFile(filepath.Join(base, "cgroup.subtree_control"), "+memory +pids"); err != nil {
		return nil, "enable controllers below sandbox cgroup: " + err.Error()
	}
	return &cgroups{base: base}, ""
}

type cgroup struct {
	path string
	fd   int
}

func (c *cgroups) create(name string, memBytes int64, pids int) (*cgroup, error) {
	p := filepath.Join(c.base, name)
	if err := os.Mkdir(p, 0o755); err != nil {
		return nil, err
	}
	g := &cgroup{path: p, fd: -1}
	if memBytes > 0 {
		if err := writeFile(filepath.Join(p, "memory.max"), strconv.FormatInt(memBytes, 10)); err != nil {
			g.remove()
			return nil, fmt.Errorf("memory.max: %w", err)
		}
		_ = writeFile(filepath.Join(p, "memory.swap.max"), "0")
		// memory.oom.group stays 0: an OOM in one parallel compile should
		// only fail that stage, not the whole build.
	}
	if pids > 0 {
		if err := writeFile(filepath.Join(p, "pids.max"), strconv.Itoa(pids)); err != nil {
			g.remove()
			return nil, fmt.Errorf("pids.max: %w", err)
		}
	}
	fd, err := syscall.Open(p, syscall.O_RDONLY|syscall.O_DIRECTORY|syscall.O_CLOEXEC, 0)
	if err != nil {
		g.remove()
		return nil, err
	}
	g.fd = fd
	return g, nil
}

func (g *cgroup) addPID(pid int) error {
	return writeFile(filepath.Join(g.path, "cgroup.procs"), strconv.Itoa(pid))
}

// kill kills every process in the cgroup (cgroup.kill, Linux 5.14+; else
// SIGKILL to each listed pid).
func (g *cgroup) kill() {
	if writeFile(filepath.Join(g.path, "cgroup.kill"), "1") == nil {
		return
	}
	for _, pid := range g.pids() {
		syscall.Kill(pid, syscall.SIGKILL)
	}
}

func (g *cgroup) pids() []int {
	b, err := os.ReadFile(filepath.Join(g.path, "cgroup.procs"))
	if err != nil {
		return nil
	}
	var out []int
	for _, f := range strings.Fields(string(b)) {
		if n, err := strconv.Atoi(f); err == nil {
			out = append(out, n)
		}
	}
	return out
}

func (g *cgroup) oomKills() int64 { return readOOMKills(filepath.Join(g.path, "memory.events")) }

func readOOMKills(path string) int64 {
	b, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	sc := bufio.NewScanner(bytes.NewReader(b))
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) == 2 && f[0] == "oom_kill" {
			n, _ := strconv.ParseInt(f[1], 10, 64)
			return n
		}
	}
	return 0
}

// remove kills what is left and removes the cgroup; it waits briefly for the
// kernel to empty it.
func (g *cgroup) remove() error {
	if g.fd >= 0 {
		syscall.Close(g.fd)
		g.fd = -1
	}
	deadline := time.Now().Add(3 * time.Second)
	for {
		err := os.Remove(g.path)
		if err == nil || os.IsNotExist(err) {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("cgroup %s not empty: %w", filepath.Base(g.path), err)
		}
		g.kill()
		time.Sleep(10 * time.Millisecond)
	}
}
