//go:build linux

package sandbox

// Syscall numbers for the seccomp filter. Both architectures' tables are
// compiled on every Linux build so the tests can check and evaluate the
// amd64 filter on arm64 (and vice versa); the filter uses nativeArch.
//
// Sources: arch/x86/entry/syscalls/syscall_64.tbl and
// include/uapi/asm-generic/unistd.h (arm64). TestSeccompTablesMatchHeaders
// re-checks every number against the kernel headers when they are installed.

type seccompArch struct {
	name      string
	auditArch uint32
	x32Bit    uint32 // syscall numbers >= this are a foreign ABI (x32); 0 = none

	socket, socketpair, clone, clone3, personality, ptrace uint32

	// denied are answered with EPERM.
	denied []namedSyscall
}

type namedSyscall struct {
	name string
	nr   uint32
}

var archAMD64 = seccompArch{
	name: "amd64", auditArch: 0xC000003E /* AUDIT_ARCH_X86_64 */, x32Bit: 0x40000000,
	socket: 41, socketpair: 53, clone: 56, clone3: 435, personality: 135, ptrace: 101,
	denied: []namedSyscall{
		{"unshare", 272}, {"setns", 308}, {"mount", 165}, {"umount2", 166}, {"pivot_root", 155},
		{"chroot", 161}, {"bpf", 321}, {"perf_event_open", 298}, {"userfaultfd", 323},
		{"keyctl", 250}, {"add_key", 248}, {"request_key", 249}, {"kexec_load", 246},
		{"kexec_file_load", 320}, {"init_module", 175}, {"finit_module", 313}, {"delete_module", 176},
		{"name_to_handle_at", 303}, {"open_by_handle_at", 304}, {"process_vm_writev", 311},
		{"io_uring_setup", 425}, {"io_uring_enter", 426}, {"io_uring_register", 427},
		{"open_tree", 428}, {"move_mount", 429}, {"fsopen", 430}, {"fsconfig", 431}, {"fsmount", 432},
		{"fspick", 433}, {"mount_setattr", 442}, {"open_tree_attr", 467},
		{"kcmp", 312}, {"syslog", 103}, {"fanotify_init", 300},
	},
}

var archARM64 = seccompArch{
	name: "arm64", auditArch: 0xC00000B7 /* AUDIT_ARCH_AARCH64 */, x32Bit: 0,
	socket: 198, socketpair: 199, clone: 220, clone3: 435, personality: 92, ptrace: 117,
	denied: []namedSyscall{
		{"unshare", 97}, {"setns", 268}, {"mount", 40}, {"umount2", 39}, {"pivot_root", 41},
		{"chroot", 51}, {"bpf", 280}, {"perf_event_open", 241}, {"userfaultfd", 282},
		{"keyctl", 219}, {"add_key", 217}, {"request_key", 218}, {"kexec_load", 104},
		{"kexec_file_load", 294}, {"init_module", 105}, {"finit_module", 273}, {"delete_module", 106},
		{"name_to_handle_at", 264}, {"open_by_handle_at", 265}, {"process_vm_writev", 271},
		{"io_uring_setup", 425}, {"io_uring_enter", 426}, {"io_uring_register", 427},
		{"open_tree", 428}, {"move_mount", 429}, {"fsopen", 430}, {"fsconfig", 431}, {"fsmount", 432},
		{"fspick", 433}, {"mount_setattr", 442}, {"open_tree_attr", 467},
		{"kcmp", 272}, {"syslog", 116}, {"fanotify_init", 262},
	},
}
