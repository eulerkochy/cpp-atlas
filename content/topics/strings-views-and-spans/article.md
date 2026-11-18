---
title: "Strings, string_view, and span"
summary: "How std::string owns characters with Small String Optimization while std::string_view and std::span borrow contiguous memory safely without hidden allocations."
track: "containers"
minutes: 10
standard:
  - "[basic.string]"
  - "[string.require]"
  - "[string.view]"
  - "[string.view.cons]"
  - "[views.span]"
cppreference:
  - title: "std::basic_string"
    path: "string/basic_string"
  - title: "std::basic_string_view"
    path: "string/basic_string_view"
  - title: "std::span"
    path: "container/span"
  - title: "std::as_bytes / std::as_writable_bytes"
    path: "container/span/as_bytes"
  - title: "std::dynamic_extent"
    path: "container/span/dynamic_extent"
prerequisites:
  - "containers-and-iterator-invalidation"
  - "reference-binding-and-temporaries"
---

Taking `const std::string&` as a function parameter used to be reflexive C++ advice, yet it silently couples every caller to heap-capable ownership. Passing a string literal `"GET /health"` or slicing three bytes out of a network packet through `const std::string&` forces construction of a temporary `std::string`, copying characters and potentially touching the allocator.

Modern C++ separates **storage ownership** from **contiguous borrowing**. `std::string` (`std::basic_string<char>`) owns its character buffer, whereas C++17 `std::string_view` and C++20 `std::span<T>` are lightweight, non-owning descriptors—essentially a pointer paired with a length—passed by value across API boundaries.

> **Mental model.** Ownership flows upward in return values (`std::string`, `std::vector<T>`); non-owning views flow downward in parameters (`std::string_view`, `std::span<const T>`). A view borrows memory it did not allocate and must never outlive the owner behind it.

## std::string, SSO, and the null-terminator invariant

Since C++11, `[string.require]` mandates that `std::basic_string` stores its elements contiguously in memory and maintains a trailing null terminator `CharT()` at `s[s.size()]`. Unlike pre-C++11 reference-counted copy-on-write strings—which were outlawed by C++11 thread-safety and invalidation rules—every modern `std::string` owns a unique buffer, and C++17 made `s.data()` return a mutable `CharT*` for non-`const` strings.

To avoid heap allocations for short strings, all major standard libraries implement the **Small String Optimization (SSO)**. When a string fits inside the object's inline byte budget (typically 15 characters on libstdc++ with `sizeof(std::string) == 32`, or 22 characters on libc++ with `sizeof(std::string) == 24`), the characters live inside the `std::string` object itself rather than on the heap:

```text
Short string (SSO active): [ inline char buffer[N] | inline size | flag ]  (no heap alloc)
Long string  (heap mode):  [ char* ptr | size | capacity        | flag ] ──▶ [ heap chars + '\0' ]
```

SSO makes short strings fast, but creates a subtle invalidation rule: **moving a `std::string` does not necessarily preserve pointers or views into its characters**. Moving a heap-mode string steals the heap pointer, whereas moving an SSO string must copy the inline bytes into the destination object and leave the source decoupled.

> **Pitfall.** Because moving an SSO `std::string` copies inline bytes into the new object's stack footprint, any `std::string_view`, pointer, or iterator pointing into the moved-from string becomes dangling or refers to the old buffer rather than the moved-to string.

When interfacing with C APIs that fill a caller-provided buffer, C++23 adds `resize_and_overwrite(max_cap, op)` so you can write directly into `std::string` storage without pre-zeroing unused bytes:

```cpp
#include <algorithm>
#include <cstring>
#include <string>

std::string build_greeting() {
    std::string out;
    out.resize_and_overwrite(64, [](char* buf, std::size_t cap) noexcept {
        constexpr char msg[] = "lucid-cpp";
        const std::size_t len = std::min(cap, sizeof(msg) - 1);
        std::memcpy(buf, msg, len);
        return len; // std::string writes buf[len] = '\0' automatically
    });
    return out;
}
```

## std::string_view: non-owning text without guarantees

`std::string_view` (`std::basic_string_view<char>`) consists solely of `{const char* data, std::size_t size}`. It is trivially copyable, two machine words wide, and converts implicitly from string literals, `const char*`, `std::string`, and (since C++20) contiguous sized character ranges. Because copying it copies two registers, pass `std::string_view` **by value**, never by `const std::string_view&`.

Two invariants separate `std::string_view` from `std::string`:

1. **No null-termination guarantee.** Slicing with `sv.remove_suffix(3)` or `sv.substr(2, 4)` simply adjusts `size_` or `data_` without copying bytes or inserting `'\0'`. Passing `sv.data()` directly to C functions expecting null-terminated strings (`std::fopen`, `std::printf("%s", ...)`, `std::strlen`) reads past the slice end and invokes undefined behavior.
2. **No lifetime ownership.** Binding `std::string_view` to a temporary `std::string` leaves the view dangling as soon as the temporary dies at the end of the full-expression. Returning a `std::string_view` from a function that constructs a local `std::string`, or storing `std::string_view` derived from a `const std::string&` parameter that a caller might satisfy with a temporary, creates immediate dangling references.

```cpp
#include <cstddef>
#include <string>
#include <string_view>

std::string_view trim_prefix(std::string_view sv, std::size_t n) {
    sv.remove_prefix(std::min(n, sv.size()));
    return sv; // Safe only while the caller's backing storage lives
}

void danger_examples() {
    // 1. Dangling: temporary std::string dies at the semicolon
    // std::string_view bad = std::string{"temp"} + "_key";

    // 2. Missing '\0' at sv.data()[sv.size()]
    std::string full = "header:body";
    std::string_view key{full.data(), 6}; // "header" — key.data()[6] is ':', not '\0'
    (void)key;
}
```

> **Standardese.** Prior to C++23, `std::string_view{nullptr}` selected the `const CharT*` constructor and caused immediate undefined behavior when computing string length. C++23 `[string.view.cons]` explicitly defines `basic_string_view(std::nullptr_t) = delete;`, turning null-pointer construction into a compile-time error.

## std::span: mutable or read-only views of contiguous memory

Where `std::string_view` models read-only character sequences, C++20 `std::span<T, Extent>` models a non-owning view over any contiguous sequence of `T` objects: `std::vector<T>`, `std::array<T, N>`, built-in arrays `T[N]`, or `(ptr, count)` pairs.

`std::span` provides two structural modes controlled by its second template parameter:

- **Dynamic extent (`std::span<T>`, default `Extent = std::dynamic_extent`):** stores `{T* ptr, std::size_t count}` (`sizeof == 2 * sizeof(void*)`) and accepts any contiguous range at runtime.
- **Static extent (`std::span<T, N>`):** encodes `N` in the type system, stores only `{T* ptr}` (`sizeof == sizeof(void*)`), and turns mismatched array sizes into compile-time diagnostics.

Crucially, **`const` on `std::span` is shallow**, matching pointer semantics rather than container semantics. `const std::span<int>` prevents rebinding the `span` to another array (`int* const`), while still allowing `s[0] = 42`. To promise read-only elements, put `const` inside the template argument: `std::span<const int>`.

```cpp
#include <array>
#include <cstddef>
#include <span>
#include <vector>

static_assert(sizeof(std::span<int, 4>) == sizeof(int*));
static_assert(sizeof(std::span<int>) == 2 * sizeof(int*));

int sum_first_two(std::span<const int> values) {
    auto head = values.first(values.size() >= 2 ? 2 : values.size());
    int total = 0;
    for (int v : head) {
        total += v;
    }
    return total;
}

void span_constness_and_bytes() {
    std::array<int, 4> arr{1, 2, 3, 4};
    const std::span<int> shallow_const{arr};
    shallow_const[0] = 99; // Well-formed: elements remain mutable

    std::span<const std::byte> raw = std::as_bytes(shallow_const);
    std::span<std::byte> rw_raw = std::as_writable_bytes(shallow_const);
    (void)raw;
    (void)rw_raw;
}
```

`std::as_bytes` and `std::as_writable_bytes` re-slice any span into `std::span<const std::byte>` or `std::span<std::byte>` (when `T` is non-`const`) with `size_bytes()` elements, giving serialization and hashing code a type-safe alternative to C-style `reinterpret_cast<const char*>` pointer arithmetic.

> **Pitfall.** Writing `const std::span<T>` as a function parameter does not prevent the function from mutating the caller's elements. Always write `std::span<const T>` for read-only array parameters.

## Choosing between string, string_view, and span

Selecting the right vocabulary type hinges on ownership, mutability, null-termination requirements, and lifetime scope.

| Type | Ownership | Null-terminated | Element mutability | Typical size | Primary role |
| --- | --- | --- | --- | --- | --- |
| `std::string` | Owning (unique or SSO) | Always (`s[size()] == '\0'`) | Mutable (unless `const`) | 24–32 bytes | Return values, stored fields, mutation |
| `std::string_view` | Non-owning | Not guaranteed | Read-only (`const char`) | 2 words | Read-only string parsing parameters |
| `std::span<const T>` | Non-owning | N/A | Read-only elements | 1 or 2 words | Read-only contiguous slice parameters |
| `std::span<T>` | Non-owning | N/A | Mutable elements | 1 or 2 words | In-place mutation of caller buffers |

Watch the **C++20 Ranges boundary** as well: both `std::string_view` and `std::span` satisfy `std::ranges::borrowed_range` and `std::ranges::view`, meaning algorithms can safely return iterators into rvalue `string_view` or `span` objects because their iterators point to underlying storage independent of the lightweight wrapper. `std::string` is neither a `view` nor a `borrowed_range`, so calling `std::ranges::find` on a temporary `std::string` yields `std::ranges::dangling` instead of a dangling iterator.

## What to remember

- `std::string` owns its bytes, guarantees `s[s.size()] == '\0'`, and invalidates views on reallocation or SSO moves.
- Pass `std::string_view` and `std::span` **by value**; never assume `sv.data()` is null-terminated after slicing or substring construction.
- `const std::span<T>` freezes the span descriptor, not the elements; use `std::span<const T>` for read-only element access.
- `std::span<T, N>` stores a single pointer when the extent `N` is static, while `std::span<T>` stores `{ptr, count}`.
- Both `std::string_view` and `std::span` model `std::ranges::borrowed_range`, shifting lifetime responsibility onto the caller whose storage they borrow.
