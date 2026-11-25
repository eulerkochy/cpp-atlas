// solution/include/my/vector.hpp - PRIVATE reference solution, all 8 stages.
//
// This is the learner's starter header (include/my/vector.hpp), completed.
// Selected by the test build with: cmake ... -DCPPATLAS_SOLUTION=ON
//
// Design summary (details at each stage marker below and in solution/README.md):
//   - Representation: pointer + size + capacity; storage from std::allocator<T>
//     (which picks the aligned operator new for over-aligned T).
//   - Growth: new capacity = max(2 * capacity(), required size), capped at
//     max_size(); std::length_error past max_size().
//   - Every reallocation goes through ONE helper, realloc_emplace(), which
//     builds the complete new buffer first (new element, then the old elements
//     relocated with move-if-noexcept semantics) and only then commits with
//     non-throwing steps. That gives the strong guarantee whenever T is
//     nothrow-move-constructible or copyable, exactly like std::vector.
//   - Copy assignment reuses existing capacity (like libstdc++/libc++): basic
//     guarantee, no allocation when other.size() <= capacity().
//   - insert in the middle without reallocation: move-construct the last
//     element into raw storage, move_backward the rest, move-assign the new
//     value into the hole. An lvalue argument is first copied into a local
//     temporary because it may alias an element that the shift moves.
//
// Rules this file follows everywhere: a slot is either raw storage or holds a
// live T, never both; raw slots are only ever constructed into
// (std::construct_at / uninitialized_*), live slots are only assigned to or
// destroyed; every constructed object is destroyed exactly once.
#pragma once

#include <algorithm>         // std::move_backward, std::max, std::min, std::equal
#include <cstddef>           // std::size_t, std::ptrdiff_t
#include <iterator>          // std::reverse_iterator
#include <limits>            // std::numeric_limits
#include <memory>            // std::allocator, std::construct_at, std::destroy, std::uninitialized_*
#include <stdexcept>         // std::length_error, std::out_of_range
#include <type_traits>       // std::is_nothrow_move_constructible_v, ...
#include <utility>           // std::move, std::forward, std::exchange, std::swap

namespace my {

template <class T>
class vector {
public:
    // --- Stage 1 + Stage 7: member types -------------------------------------
    using value_type = T;
    using size_type = std::size_t;
    using difference_type = std::ptrdiff_t;
    using reference = T&;
    using const_reference = const T&;
    using pointer = T*;
    using const_pointer = const T*;
    // A raw pointer is a contiguous iterator; no wrapper class needed.
    using iterator = T*;
    using const_iterator = const T*;
    using reverse_iterator = std::reverse_iterator<iterator>;
    using const_reverse_iterator = std::reverse_iterator<const_iterator>;

    // --- Stage 1: empty vector ----------------------------------------------
    // No allocation: a null data_ means "no buffer", which every other member
    // handles (nullptr + 0 is a valid empty range).
    vector() noexcept = default;

    size_type size() const noexcept { return size_; }
    size_type capacity() const noexcept { return capacity_; }
    bool empty() const noexcept { return size_ == 0; }

    // The largest element count we could ever allocate. Capped at PTRDIFF_MAX
    // bytes so that `end() - begin()` always fits in difference_type (libstdc++
    // and libc++ use the same bound).
    size_type max_size() const noexcept {
        constexpr size_type bytes = static_cast<size_type>(std::numeric_limits<difference_type>::max());
        return bytes / sizeof(T);
    }

    // --- Stage 2: storage, push_back, element access, destructor -----------
    ~vector() { destroy_and_deallocate(); }

    reference operator[](size_type i) noexcept { return data_[i]; }
    const_reference operator[](size_type i) const noexcept { return data_[i]; }

    // Small conveniences std::vector has; each is a one-liner on top of the above.
    reference at(size_type i) {
        if (i >= size_) throw std::out_of_range("my::vector::at: index out of range");
        return data_[i];
    }
    const_reference at(size_type i) const {
        if (i >= size_) throw std::out_of_range("my::vector::at: index out of range");
        return data_[i];
    }
    reference front() noexcept { return data_[0]; }
    const_reference front() const noexcept { return data_[0]; }
    reference back() noexcept { return data_[size_ - 1]; }
    const_reference back() const noexcept { return data_[size_ - 1]; }

    // Stage 5 re-implements both overloads on top of emplace_back: one growth
    // path instead of three. (Stage 4 adds the rvalue overload.)
    void push_back(const T& value) { emplace_back(value); }
    void push_back(T&& value) { emplace_back(std::move(value)); }

    // --- Stage 3: growth and reserve ----------------------------------------
    // reserve(n): capacity() >= n afterwards; never shrinks, never changes size().
    // Strong guarantee (Stage 6): realloc_emplace leaves *this untouched on throw
    // when T is nothrow-move-constructible or copyable.
    void reserve(size_type n) {
        if (n <= capacity_) return;
        if (n > max_size()) throw std::length_error("my::vector::reserve: n > max_size()");
        realloc_relocate_only(n);
    }

    // --- Stage 4: copy and move ---------------------------------------------
    // Deep copy: exactly size() copy constructions, capacity() == size().
    vector(const vector& other) {
        if (other.size_ == 0) return;
        T* fresh = allocate(other.size_);
        try {
            std::uninitialized_copy(other.data_, other.data_ + other.size_, fresh);
        } catch (...) {
            // uninitialized_copy already destroyed what it built; we free the
            // raw storage. (The destructor does not run for a throwing ctor.)
            deallocate(fresh, other.size_);
            throw;
        }
        data_ = fresh;
        size_ = other.size_;
        capacity_ = other.size_;
    }

    // Pointer steal: zero element operations, cannot throw, source left empty.
    vector(vector&& other) noexcept
        : data_(std::exchange(other.data_, nullptr)),
          size_(std::exchange(other.size_, 0)),
          capacity_(std::exchange(other.capacity_, 0)) {}

    // Copy assignment REUSES existing storage when it is large enough, like
    // libstdc++ and libc++: no allocation in the common case, but only the
    // basic guarantee (if a copy throws halfway, *this holds a mix of old and
    // new elements - all valid, none leaked). The alternative, copy-and-swap
    // (`vector tmp(other); swap(tmp);`), is strong but always allocates.
    vector& operator=(const vector& other) {
        if (this == &other) return *this;  // otherwise we would assign elements to themselves
                                           // (harmless) or destroy what we copy from (not)
        if (other.size_ > capacity_) {
            // Does not fit: build a complete copy first, then swap it in. If the
            // copy throws, *this is untouched (strong, in this branch).
            vector tmp(other);
            swap(tmp);
        } else if (other.size_ <= size_) {
            // Assign over the first other.size_ live elements, destroy the surplus.
            T* new_end = std::copy(other.data_, other.data_ + other.size_, data_);
            std::destroy(new_end, data_ + size_);
            size_ = other.size_;
        } else {
            // Assign over all our live elements, then copy-construct the rest
            // into raw storage (assigning into raw storage would be UB).
            std::copy(other.data_, other.data_ + size_, data_);
            std::uninitialized_copy(other.data_ + size_, other.data_ + other.size_, data_ + size_);
            size_ = other.size_;  // only after the constructions succeeded
        }
        return *this;
    }

    // Steal other's buffer and release ours. Going through a temporary makes it
    // self-assignment-safe: `v = std::move(v)` leaves v unchanged.
    // Not a bare `swap(other)`: that would hand our old elements to `other`,
    // and they must be destroyed by this assignment ([container.reqmts]: the
    // target's existing elements are move-assigned to or destroyed).
    vector& operator=(vector&& other) noexcept {
        vector tmp(std::move(other));  // other is now empty
        swap(tmp);                     // tmp's destructor frees our old contents
        return *this;
    }

    void swap(vector& other) noexcept {
        std::swap(data_, other.data_);
        std::swap(size_, other.size_);
        std::swap(capacity_, other.capacity_);
    }
    friend void swap(vector& a, vector& b) noexcept { a.swap(b); }

    // --- Stage 5: emplace_back, pop_back, clear -----------------------------
    // Constructs T(std::forward<Args>(args)...) - parentheses, not braces -
    // directly in the next slot. Fast path: exactly one constructor call.
    template <class... Args>
    reference emplace_back(Args&&... args) {
        if (size_ == capacity_) {
            // args may refer into our own buffer (v.emplace_back(v[0])), so the
            // slow path constructs the new element BEFORE relocating anything.
            return *realloc_emplace(size_, recommend(size_ + 1), std::forward<Args>(args)...);
        }
        T* slot = std::construct_at(data_ + size_, std::forward<Args>(args)...);
        ++size_;  // only after construction succeeded: a throwing ctor changes nothing
        return *slot;
    }

    // Precondition: !empty() (like std::vector, not checked).
    void pop_back() noexcept {
        --size_;
        std::destroy_at(data_ + size_);
    }

    // Destroys every element; capacity() is unchanged.
    void clear() noexcept {
        std::destroy(data_, data_ + size_);
        size_ = 0;
    }

    // --- Stage 7: iterators --------------------------------------------------
    iterator begin() noexcept { return data_; }
    const_iterator begin() const noexcept { return data_; }
    iterator end() noexcept { return data_ + size_; }
    const_iterator end() const noexcept { return data_ + size_; }
    const_iterator cbegin() const noexcept { return begin(); }
    const_iterator cend() const noexcept { return end(); }

    reverse_iterator rbegin() noexcept { return reverse_iterator(end()); }
    const_reverse_iterator rbegin() const noexcept { return const_reverse_iterator(end()); }
    reverse_iterator rend() noexcept { return reverse_iterator(begin()); }
    const_reverse_iterator rend() const noexcept { return const_reverse_iterator(begin()); }
    const_reverse_iterator crbegin() const noexcept { return rbegin(); }
    const_reverse_iterator crend() const noexcept { return rend(); }

    pointer data() noexcept { return data_; }
    const_pointer data() const noexcept { return data_; }

    // --- Stage 8: insert and erase -------------------------------------------
    // Returns an iterator to the inserted element. `value` may alias an element
    // of *this (v.insert(v.begin(), v.back())).
    iterator insert(const_iterator pos, const T& value) { return emplace(pos, value); }

    // An rvalue argument is assumed not to alias *this ([res.on.arguments]), so
    // it can be moved into place directly, without a temporary.
    iterator insert(const_iterator pos, T&& value) {
        const size_type index = index_of(pos);
        if (size_ == capacity_) return realloc_emplace(index, recommend(size_ + 1), std::move(value));
        if (index == size_) {
            std::construct_at(data_ + size_, std::move(value));
            ++size_;
        } else {
            shift_and_assign(index, std::move(value));
        }
        return data_ + index;
    }

    // Constructs a T from args before pos. Same strategy as insert(const T&).
    template <class... Args>
    iterator emplace(const_iterator pos, Args&&... args) {
        // Remember the INDEX: a reallocation would invalidate any pointer.
        const size_type index = index_of(pos);
        if (size_ == capacity_) {
            // The new buffer is built around the new element, which is
            // constructed first, so aliasing arguments are still alive.
            return realloc_emplace(index, recommend(size_ + 1), std::forward<Args>(args)...);
        }
        if (index == size_) {
            // Appending into spare capacity moves nothing, so even an aliasing
            // argument is still valid: construct in place (strong guarantee).
            std::construct_at(data_ + size_, std::forward<Args>(args)...);
            ++size_;
        } else {
            // The shift below moves elements around; if args refer to one of
            // them, they would see a moved-from value. Materialize the new
            // value first (this is what libstdc++ does too).
            T tmp(std::forward<Args>(args)...);
            shift_and_assign(index, std::move(tmp));
        }
        return data_ + index;
    }

    // Removes [first, last); returns an iterator to the element that followed
    // the range. Exactly (end() - last) move assignments and (last - first)
    // destructor calls. Never reallocates; capacity() is unchanged.
    iterator erase(const_iterator first, const_iterator last) {
        T* dst = data_ + index_of(first);
        if (first == last) return dst;
        T* src = data_ + index_of(last);
        // Close the gap left-to-right (std::move is the right algorithm when
        // the destination precedes the source), then destroy the moved-from tail.
        T* new_end = std::move(src, data_ + size_, dst);
        std::destroy(new_end, data_ + size_);
        size_ = static_cast<size_type>(new_end - data_);
        return dst;
    }

    iterator erase(const_iterator pos) { return erase(pos, pos + 1); }

    // Not part of the stages, but free with the pieces above.
    friend bool operator==(const vector& a, const vector& b) {
        return a.size_ == b.size_ && std::equal(a.begin(), a.end(), b.begin());
    }

private:
    // --- storage helpers ------------------------------------------------------
    static T* allocate(size_type n) { return std::allocator<T>().allocate(n); }
    static void deallocate(T* p, size_type n) noexcept {
        if (p != nullptr) std::allocator<T>().deallocate(p, n);
    }

    void destroy_and_deallocate() noexcept {
        std::destroy(data_, data_ + size_);
        deallocate(data_, capacity_);
    }

    size_type index_of(const_iterator pos) const noexcept {
        // const_iterator -> index; never convert const T* to T* directly.
        return static_cast<size_type>(pos - cbegin());
    }

    // Geometric growth (Stage 3): double the capacity, but at least `required`,
    // at most max_size(). Any factor > 1 gives amortized O(1) push_back.
    size_type recommend(size_type required) const {
        const size_type max = max_size();
        if (required > max) throw std::length_error("my::vector: size would exceed max_size()");
        if (capacity_ >= max / 2) return max;
        return std::max(2 * capacity_, required);
    }

    // --- Stage 6: relocation with move_if_noexcept semantics -----------------
    // Moving is only safe for the strong guarantee if it cannot throw: once an
    // old element has been moved from, a later failure cannot restore it
    // (moving it back might throw too). So:
    //   nothrow move             -> move (fast, cannot fail)
    //   throwing move + copyable -> copy (the old buffer stays intact)
    //   throwing move, move-only -> move anyway (basic guarantee only)
    // That is exactly std::move_if_noexcept's rule.
    static constexpr bool relocate_by_move =
        std::is_nothrow_move_constructible_v<T> || !std::is_copy_constructible_v<T>;

    // Constructs copies/moves of [first, last) into raw storage at dest. On an
    // exception the standard algorithms destroy whatever they had built and
    // rethrow, so on throw nothing new is left alive.
    static void relocate(T* first, T* last, T* dest) {
        if constexpr (relocate_by_move) {
            std::uninitialized_move(first, last, dest);
        } else {
            std::uninitialized_copy(static_cast<const T*>(first), static_cast<const T*>(last), dest);
        }
    }

    // Phase two of every reallocation: nothing here can throw. Destroy the old
    // elements, free the old buffer, adopt the new one.
    void commit(T* fresh, size_type new_cap, size_type new_size) noexcept {
        destroy_and_deallocate();
        data_ = fresh;
        size_ = new_size;
        capacity_ = new_cap;
    }

    // Reallocate to new_cap and construct a new element at `index` from args,
    // shifting [index, size()) one slot right in the new buffer. Used by
    // emplace_back (index == size()), insert and emplace. Returns a pointer to
    // the new element.
    //
    // Phase one (may throw), in this order:
    //   1. allocate the new buffer;
    //   2. construct the new element at fresh + index - FIRST, while args (which
    //      may refer into the old buffer) are certainly still intact;
    //   3. relocate [0, index) to the front, 4. relocate [index, size) after it.
    // On any throw: destroy exactly what was built in the new buffer (tracked as
    // one contiguous range [built_first, built_last)), free it, rethrow. The old
    // buffer was only read (or, for a throwing-move move-only T, moved from),
    // so *this is unchanged.
    template <class... Args>
    T* realloc_emplace(size_type index, size_type new_cap, Args&&... args) {
        T* fresh = allocate(new_cap);
        T* built_first = fresh + index;  // constructed range in the new buffer
        T* built_last = fresh + index;
        try {
            std::construct_at(fresh + index, std::forward<Args>(args)...);
            built_last = fresh + index + 1;
            relocate(data_, data_ + index, fresh);  // cleans up after itself on throw
            built_first = fresh;
            relocate(data_ + index, data_ + size_, fresh + index + 1);
        } catch (...) {
            std::destroy(built_first, built_last);
            deallocate(fresh, new_cap);
            throw;
        }
        commit(fresh, new_cap, size_ + 1);  // phase two
        return fresh + index;
    }

    // Reallocation without a new element (reserve). Same two phases.
    void realloc_relocate_only(size_type new_cap) {
        T* fresh = allocate(new_cap);
        try {
            relocate(data_, data_ + size_, fresh);
        } catch (...) {
            deallocate(fresh, new_cap);
            throw;
        }
        commit(fresh, new_cap, size_);
    }

    // --- Stage 8: shifting insert without reallocation -----------------------
    // Precondition: size() < capacity() and index < size(). `value` does not
    // alias *this. Opens a hole at index and move-assigns value into it:
    //   [a b c d e | raw]  ->  move-construct e into the raw slot (it is raw:
    //   construct, never assign), move_backward [index, size-1) one to the
    //   right (live slots: assign), move-assign value into data_[index].
    // If the first construction throws, nothing changed. After it, size_ owns
    // the new slot, so a later throw leaves a valid (unspecified) vector: the
    // basic guarantee the standard gives for insert in the middle.
    void shift_and_assign(size_type index, T&& value) {
        T* last = data_ + size_ - 1;
        std::construct_at(data_ + size_, std::move(*last));
        ++size_;
        std::move_backward(data_ + index, last, last + 1);
        data_[index] = std::move(value);
    }

    T* data_ = nullptr;      // first element, or null when no buffer
    size_type size_ = 0;     // live elements: data_[0] .. data_[size_ - 1]
    size_type capacity_ = 0; // allocated slots
};

}  // namespace my
