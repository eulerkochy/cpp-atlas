//go:build linux

package sandbox

import (
	"fmt"
	"syscall"
	"unsafe"
)

// A seccomp filter applied to every sandboxed command, on top of whatever
// the container runtime installs (docker's default profile in docker mode;
// nothing on a Fly Machine). It blocks kernel attack surface a C++ learner
// never needs and the escape hatches that a network namespace does not cover:
//
//   - sockets: only AF_UNIX may be created (socket, socketpair); every other
//     family fails with EAFNOSUPPORT. Nothing in the toolchain or the tests
//     needs inet, netlink, packet or vsock sockets, and vsock in particular
//     is not network-namespace aware (on a Firecracker VM it reaches the
//     host side);
//   - creating or entering namespaces (unshare, setns, clone with CLONE_NEW*;
//     clone3 is answered ENOSYS so libc falls back to clone, as docker does),
//     mount and the new mount API, pivot_root, chroot;
//   - bpf, perf_event_open, userfaultfd, io_uring, keyrings, kexec, modules,
//     open_by_handle_at, process_vm_writev, kcmp, syslog, fanotify;
//   - personality(): only the query (0xffffffff), PER_LINUX (0) and
//     PER_LINUX|ADDR_NO_RANDOMIZE (the sanitizer runtimes re-exec themselves
//     with ASLR off when the shadow layout does not fit) are allowed;
//   - any non-native syscall ABI (x32 on amd64, compat 32-bit): killed.
//
// ptrace stays allowed: LeakSanitizer stops the process's own threads with
// it (PTRACE_ATTACH/GETREGS(ET)/CONT/DETACH). It can only reach processes of
// the sandbox uid (the grader is non-dumpable, the namespace init is root).

type sockFilter struct {
	Code uint16
	Jt   uint8
	Jf   uint8
	K    uint32
}

type sockFprog struct {
	Len    uint16
	_      [3]uint16
	Filter *sockFilter
}

const (
	bpfLD   = 0x00
	bpfW    = 0x00
	bpfABS  = 0x20
	bpfJMP  = 0x05
	bpfJEQ  = 0x10
	bpfJGE  = 0x30
	bpfJSET = 0x40
	bpfK    = 0x00
	bpfRET  = 0x06

	retKillProcess = 0x80000000
	retErrno       = 0x00050000
	retAllow       = 0x7fff0000

	offNr   = 0
	offArch = 4
	offArg0 = 16 // low 32 bits of args[0] (little endian)

	afUnix          = 1
	perLinux        = 0
	addrNoRandomize = 0x0040000
	// CLONE_NEWNS|NEWCGROUP|NEWUTS|NEWIPC|NEWUSER|NEWPID|NEWNET
	cloneNSFlags = 0x00020000 | 0x02000000 | 0x04000000 | 0x08000000 | 0x10000000 | 0x20000000 | 0x40000000

	prSetNoNewPrivs   = 38
	prSetSeccomp      = 22
	seccompModeFilter = 2
)

// asm is a tiny BPF assembler with symbolic jump targets.
type insn struct {
	f      sockFilter
	jt, jf string // label names ("" = next instruction)
	label  string
}

func buildSeccompFilter() ([]sockFilter, error) { return buildSeccompFilterFor(nativeArch) }

func buildSeccompFilterFor(a *seccompArch) ([]sockFilter, error) {
	var p []insn
	emit := func(code uint16, k uint32, jt, jf string) {
		p = append(p, insn{f: sockFilter{Code: code, K: k}, jt: jt, jf: jf})
	}
	label := func(name string) { p = append(p, insn{label: name}) }
	ld := func(off uint32) { emit(bpfLD|bpfW|bpfABS, off, "", "") }
	ret := func(v uint32) { emit(bpfRET|bpfK, v, "", "") }
	jeq := func(k uint32, target string) { emit(bpfJMP|bpfJEQ|bpfK, k, target, "") }

	ld(offArch)
	emit(bpfJMP|bpfJEQ|bpfK, a.auditArch, "", "kill")
	ld(offNr)
	if a.x32Bit != 0 {
		emit(bpfJMP|bpfJGE|bpfK, a.x32Bit, "kill", "")
	}
	for _, d := range a.denied {
		jeq(d.nr, "eperm")
	}
	jeq(a.clone3, "enosys")
	jeq(a.clone, "clone")
	jeq(a.socket, "socket")
	jeq(a.socketpair, "socket")
	jeq(a.personality, "personality")
	ret(retAllow)

	label("clone")
	ld(offArg0)
	emit(bpfJMP|bpfJSET|bpfK, cloneNSFlags, "eperm", "")
	ret(retAllow)

	label("socket")
	ld(offArg0)
	jeq(afUnix, "allow")
	ret(retErrno | uint32(syscall.EAFNOSUPPORT))

	label("personality")
	ld(offArg0)
	jeq(0xffffffff, "allow")
	jeq(perLinux, "allow")
	jeq(perLinux|addrNoRandomize, "allow")
	ret(retErrno | uint32(syscall.EPERM))

	label("allow")
	ret(retAllow)
	label("eperm")
	ret(retErrno | uint32(syscall.EPERM))
	label("enosys")
	ret(retErrno | uint32(syscall.ENOSYS))
	label("kill")
	ret(retKillProcess)

	// Resolve labels.
	pos := map[string]int{}
	var out []sockFilter
	var src []insn
	for _, in := range p {
		if in.label != "" {
			pos[in.label] = len(src)
			continue
		}
		src = append(src, in)
	}
	for i, in := range src {
		f := in.f
		for _, j := range []struct {
			name string
			dst  *uint8
		}{{in.jt, &f.Jt}, {in.jf, &f.Jf}} {
			if j.name == "" {
				continue
			}
			t, ok := pos[j.name]
			if !ok {
				return nil, fmt.Errorf("seccomp: unknown label %q", j.name)
			}
			d := t - (i + 1)
			if d < 0 || d > 255 {
				return nil, fmt.Errorf("seccomp: jump to %q out of range", j.name)
			}
			*j.dst = uint8(d)
		}
		out = append(out, f)
	}
	return out, nil
}

// setNoNewPrivs sets PR_SET_NO_NEW_PRIVS on the calling thread (inherited
// by children and kept across execve).
func setNoNewPrivs() error {
	if _, _, e := syscall.RawSyscall6(syscall.SYS_PRCTL, prSetNoNewPrivs, 1, 0, 0, 0, 0); e != 0 {
		return e
	}
	return nil
}

// installSeccomp installs the filter on the calling thread. The caller must
// have locked the goroutine to its OS thread and must execve from it.
func installSeccomp() error {
	f, err := buildSeccompFilter()
	if err != nil {
		return err
	}
	prog := sockFprog{Len: uint16(len(f)), Filter: &f[0]}
	if _, _, e := syscall.RawSyscall(syscall.SYS_PRCTL, prSetSeccomp, seccompModeFilter, uintptr(unsafe.Pointer(&prog))); e != 0 {
		return e
	}
	return nil
}
