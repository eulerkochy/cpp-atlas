//go:build linux

package sandbox

import (
	"bufio"
	"encoding/binary"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"syscall"
	"testing"
)

// runBPF evaluates a classic-BPF seccomp program the way the kernel does for
// a struct seccomp_data {nr, arch, ip, args[6]}.
func runBPF(t *testing.T, prog []sockFilter, arch, nr uint32, args ...uint64) uint32 {
	t.Helper()
	data := make([]byte, 64)
	binary.LittleEndian.PutUint32(data[0:], nr)
	binary.LittleEndian.PutUint32(data[4:], arch)
	for i, a := range args {
		binary.LittleEndian.PutUint64(data[16+8*i:], a)
	}
	var acc uint32
	for pc := 0; pc < len(prog); pc++ {
		in := prog[pc]
		switch in.Code {
		case bpfLD | bpfW | bpfABS:
			acc = binary.LittleEndian.Uint32(data[in.K:])
		case bpfJMP | bpfJEQ | bpfK:
			if acc == in.K {
				pc += int(in.Jt)
			} else {
				pc += int(in.Jf)
			}
		case bpfJMP | bpfJGE | bpfK:
			if acc >= in.K {
				pc += int(in.Jt)
			} else {
				pc += int(in.Jf)
			}
		case bpfJMP | bpfJSET | bpfK:
			if acc&in.K != 0 {
				pc += int(in.Jt)
			} else {
				pc += int(in.Jf)
			}
		case bpfRET | bpfK:
			return in.K
		default:
			t.Fatalf("unknown opcode %#x at %d", in.Code, pc)
		}
	}
	t.Fatal("fell off the end of the program")
	return 0
}

// TestSeccompPolicy checks the decisions of the filter for BOTH
// architectures (the amd64 one cannot be executed on an arm64 host).
func TestSeccompPolicy(t *testing.T) {
	eperm := uint32(retErrno | uint32(syscall.EPERM))
	eafns := uint32(retErrno | uint32(syscall.EAFNOSUPPORT))
	enosys := uint32(retErrno | uint32(syscall.ENOSYS))
	for _, a := range []*seccompArch{&archAMD64, &archARM64} {
		t.Run(a.name, func(t *testing.T) {
			prog, err := buildSeccompFilterFor(a)
			if err != nil {
				t.Fatal(err)
			}
			if prog[len(prog)-1].Code != bpfRET|bpfK || prog[len(prog)-1].K != retKillProcess {
				t.Fatalf("last instruction %+v", prog[len(prog)-1])
			}
			check := func(what string, want uint32, nr uint32, args ...uint64) {
				t.Helper()
				if got := runBPF(t, prog, a.auditArch, nr, args...); got != want {
					t.Errorf("%s: got %#x, want %#x", what, got, want)
				}
			}
			for _, d := range a.denied {
				check(d.name, eperm, d.nr)
			}
			check("socket(AF_UNIX)", retAllow, a.socket, 1, 1, 0)
			check("socket(AF_UNIX|high bits)", retAllow, a.socket, 1|1<<40, 1, 0)
			for _, fam := range []uint64{2 /*INET*/, 10 /*INET6*/, 16 /*NETLINK*/, 17 /*PACKET*/, 40 /*VSOCK*/, 0, 0xffffffff} {
				check("socket("+strconv.FormatUint(fam, 10)+")", eafns, a.socket, fam, 1, 0)
			}
			check("socketpair(AF_UNIX)", retAllow, a.socketpair, 1, 1, 0)
			check("socketpair(AF_INET)", eafns, a.socketpair, 2, 1, 0)
			check("personality(query)", retAllow, a.personality, 0xffffffff)
			check("personality(PER_LINUX)", retAllow, a.personality, 0)
			check("personality(ADDR_NO_RANDOMIZE)", retAllow, a.personality, 0x0040000)
			check("personality(PER_LINUX32)", eperm, a.personality, 8)
			check("personality(READ_IMPLIES_EXEC)", eperm, a.personality, 0x0400000)
			check("clone(thread)", retAllow, a.clone, 0x003d0f00)
			check("clone(CLONE_NEWUSER)", eperm, a.clone, 0x10000000|17)
			check("clone(CLONE_NEWNET)", eperm, a.clone, 0x40000000)
			check("clone3", enosys, a.clone3)
			check("ptrace (LSan)", retAllow, a.ptrace, 16)
			check("read", retAllow, 63)
			if got := runBPF(t, prog, 0x40000003 /*AUDIT_ARCH_I386*/, a.socket, 2); got != retKillProcess {
				t.Errorf("foreign arch: got %#x", got)
			}
			if a.x32Bit != 0 {
				if got := runBPF(t, prog, a.auditArch, a.x32Bit|a.socket, 2); got != retKillProcess {
					t.Errorf("x32 syscall: got %#x", got)
				}
			}
		})
	}
}

// TestSeccompTablesMatchHeaders cross-checks every syscall number against
// the kernel UAPI headers of whatever architectures are installed
// (linux-libc-dev; the grader image has its own architecture's).
func TestSeccompTablesMatchHeaders(t *testing.T) {
	headers := map[*seccompArch][]string{
		&archAMD64: {"/usr/include/x86_64-linux-gnu/asm/unistd_64.h", "/usr/include/asm/unistd_64.h"},
		&archARM64: {"/usr/include/asm-generic/unistd.h", "/usr/include/aarch64-linux-gnu/asm/unistd.h"},
	}
	if p := os.Getenv("CPPATLAS_AMD64_UNISTD"); p != "" {
		headers[&archAMD64] = []string{p}
	}
	if p := os.Getenv("CPPATLAS_ARM64_UNISTD"); p != "" {
		headers[&archARM64] = []string{p}
	}
	re := regexp.MustCompile(`^#define __NR(?:3264)?_([a-z0-9_]+)\s+([0-9]+)`)
	checked := 0
	for a, paths := range headers {
		nums := map[string]uint32{}
		for _, p := range paths {
			f, err := os.Open(p)
			if err != nil {
				continue
			}
			sc := bufio.NewScanner(f)
			for sc.Scan() {
				if m := re.FindStringSubmatch(sc.Text()); m != nil {
					n, _ := strconv.Atoi(m[2])
					nums[m[1]] = uint32(n)
				}
			}
			f.Close()
		}
		if a == &archARM64 {
			// asm-generic spells a few through __NR3264_ aliases.
			if _, ok := nums["fcntl"]; !ok && len(nums) > 0 {
				t.Logf("arm64: no __NR3264_ entries parsed")
			}
		}
		if len(nums) < 100 {
			t.Logf("%s: headers not installed (%v), skipped", a.name, paths)
			continue
		}
		all := append([]namedSyscall{
			{"socket", a.socket}, {"socketpair", a.socketpair}, {"clone", a.clone}, {"clone3", a.clone3},
			{"personality", a.personality}, {"ptrace", a.ptrace},
		}, a.denied...)
		for _, s := range all {
			n, ok := nums[s.name]
			switch {
			case !ok:
				t.Logf("%s: %s not in headers (older kernel headers?)", a.name, s.name)
			case n != s.nr:
				t.Errorf("%s: %s is %d in the headers, %d in the table", a.name, s.name, n, s.nr)
			default:
				checked++
			}
		}
		t.Logf("%s: checked against %s", a.name, filepath.Base(paths[0]))
	}
	if checked == 0 {
		t.Skip("no kernel headers available")
	}
}
