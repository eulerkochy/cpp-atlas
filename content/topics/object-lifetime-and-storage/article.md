---
title: "Object lifetime and storage"
summary: "Why raw memory allocation differs from object existence: storage durations, [basic.life] rules, implicit-lifetime types, std::launder, and temporary lifetime extension."
track: memory-model
minutes: 11
standard:
  - "[basic.stc]"
  - "[basic.life]"
  - "[intro.object]"
  - "[ptr.launder]"
  - "[class.temporary]"
  - "[stmt.ranged]"
cppreference:
  - title: "Lifetime"
    path: "language/lifetime"
  - title: "Storage class specifiers"
    path: "language/storage_duration"
  - title: "Object"
    path: "language/object"
  - title: "std::launder"
    path: "utility/launder"
  - title: "std::start_lifetime_as"
    path: "memory/start_lifetime_as"
  - title: "std::is_implicit_lifetime"
    path: "types/is_implicit_lifetime"
  - title: "Range-based for loop"
    path: "language/range-for"
prerequisites:
  - "initialization-forms"
  - "value-categories"
  - "raii-and-resource-management"
---

C++ separates **where and how long raw bytes exist** from **when a typed object legally lives inside those bytes**. Conflating the two leads to dangling pointers, broken placement-new code, and optimizer surprises when compilers reason about `const` members or uninitialized buffers.

## Storage duration versus object lifetime

Every region of memory backing an object has one of four **storage durations** (`[basic.stc]`):

| Storage duration | Obtained and released | Typical examples | Thread sharing |
| --- | --- | --- | --- |
| Static | Program startup until exit | Globals, `static` locals | Shared across all threads |
| Thread | Thread launch until thread exit | `thread_local` variables | Private per thread |
| Automatic | Block entry until block exit | Local variables, parameters | Stack-bound unless address shared |
| Dynamic | Explicit `new`/`malloc` until `delete`/`free` | Heap allocations, containers | Governed by ownership |

Storage duration governs only the raw memory. Under `[basic.life]`, an object's **lifetime** is a runtime property that starts only after storage with proper size and alignment is obtained **and** initialization completes (or vacuous initialization finishes for trivial types). Lifetime ends either when the destructor call **starts** (for class types with non-trivial destructors) or when the storage is reused or released.

> **Mental model.** Storage duration is a lease on an apartment; object lifetime is the tenancy itself. Holding keys to an empty apartment does not mean a tenant lives inside.

> **Standardese.** Per `[basic.life]/1`, for any class type with a non-trivial destructor, object lifetime ends the instant execution enters its destructor—before the destructor body even runs its first statement.

## Outside lifetime: what you can and cannot touch

Suppose you allocate raw aligned storage on the stack (`alignas(T) std::byte buf[sizeof(T)]`) or obtain memory from `operator new`. Before an object's lifetime begins—or after its destructor runs while the storage still remains allocated—a pointer `T*` pointing to that address has severe restrictions (`[basic.life]/6–7`):

- **Allowed:** converting the pointer to `void*`, passing it to placement `new` or `std::construct_at`, or comparing addresses (while storage still exists).
- **Undefined behavior:** reading or writing non-static data members, invoking non-static member functions, casting to a base class, or calling `delete` on the typed pointer.

C++20 added `std::construct_at(ptr, args...)` and `std::destroy_at(ptr)` in `<memory>` so custom containers and pools can start and end lifetimes cleanly—even inside `constexpr` evaluation, where raw placement `new` was historically disallowed until C++26.

## Implicit-lifetime types and start_lifetime_as

Before C++20, calling `std::malloc(sizeof(Packet))` and casting the returned `void*` to `Packet*` technically created undefined behavior because `malloc` allocates bytes without running constructors. Real C and systems code relied on it anyway.

C++20 solved this cleanly in `[intro.object]` by defining **implicit-lifetime types**: scalar types, aggregate classes with no user-provided constructors and trivial destructors (or eligible implicit-lifetime class types without user-provided destructors), and arrays of those types. Certain operations—`std::malloc`, `std::calloc`, `std::realloc`, `std::memcpy`, `std::memmove`, `operator new`, and creating a `std::byte` or `unsigned char` array—**implicitly create objects** of suitable implicit-lifetime types inside the region so the program's subsequent access has defined behavior.

C++23 went one step further with `std::start_lifetime_as<T>(ptr)` (and `std::start_lifetime_as_array<T>(ptr, n)`) for situations where raw bytes already hold a valid representation—such as memory-mapped files or socket buffers—and you want to read them in-place without copying:

```cpp
#include <cstddef>
#include <memory>
#include <type_traits>

struct PacketHeader {
    unsigned int seq;
    unsigned int length;
};
static_assert(std::is_implicit_lifetime_v<PacketHeader>);

unsigned int inspect_wire(const std::byte* aligned_bytes) {
    // Begins lifetime of PacketHeader in-place without copying or overwriting bytes.
    const auto* hdr = std::start_lifetime_as<PacketHeader>(aligned_bytes);
    return hdr->seq + hdr->length;
}
```

Ensure `aligned_bytes` already satisfies `alignof(PacketHeader)` and covers `sizeof(PacketHeader)` valid bytes; `std::start_lifetime_as` performs zero runtime instructions and zero-copy type blessing for the abstract machine.

## Reusing storage and why std::launder exists

When you destroy an object in place and placement-new a brand-new object into the **exact same address**, can older pointers `p` to the original object keep working?

Under `[basic.life]/8`, an existing pointer or reference is **transparently replaceable** only if every one of these holds:

1. The new object occupies the exact same storage location and has the **exact same type** (ignoring top-level cv-qualifiers).
2. The old object was a complete object (not a base-class subobject) or an array element whose replacement is also an array element.
3. The type contains **no `const` non-static data members** and **no reference non-static data members**.

If your struct contains a `const` field or reference member, an optimizer seeing `p->id` earlier may legally cache that constant forever—even across a placement `new (p)` call! You must either use the pointer returned by placement `new` directly or pass the stale pointer through `std::launder(p)` (`[ptr.launder]`):

```cpp
#include <memory>
#include <new>

struct Node {
    const int id;
    int payload;
};

int reuse_const_member() {
    Node* p = new Node{1, 10};
    p->~Node();

    Node* q = ::new (p) Node{2, 20};
    // p->id would be UB here because Node has a const member!
    int from_new = q->id;               // Well-defined: 2
    int from_launder = std::launder(p)->id; // Well-defined: 2

    std::destroy_at(q);
    ::operator delete(q);
    return from_new + from_launder;
}
```

> **Pitfall.** Placement-new reusing storage that holds a `const` or reference non-static member does **not** update pre-existing pointers to that address; dereferencing the old pointer without `std::launder` lets the compiler reuse stale cached values under `[basic.life]/8`.

Notice what `std::launder` does **not** do: it never creates an object or bypasses strict aliasing. It purely serves as an optimization barrier declaring that an already-live object of type `T` now resides at that address.

## Temporary materialization and the range-for fix

Temporaries materialized from prvalues normally survive only until the end of the **full-expression** containing them (typically the semicolon). Direct binding to a `const T&` or `T&&` reference extends the temporary's lifetime to match the reference's scope (`[class.temporary]`).

That rule has a notorious boundary: **lifetime extension never propagates through function calls or chained member accesses** (except direct subobject selection on the temporary itself, like `const int& m = make_pair().first;`). Calling `const char* s = make_name().c_str();` or capturing a `std::string_view` over a temporary `std::string` creates an instant dangling pointer at the semicolon.

For twelve years, range-based `for` loops suffered from the exact same cliff because their desugaring bound `auto&& __range = range_expr;`. Writing `for (int v : make_holder().items)` extended only `.items` while destroying the outer `Holder` temporary before iteration began! C++23 paper P2718R0 finally fixed `[stmt.ranged]`:

```cpp
#include <vector>

struct Holder {
    std::vector<int> items{1, 2, 3};
};
Holder make_holder() { return {}; }

int sum_items() {
    int total = 0;
    // Pre-C++23: UB (Holder temporary died before loop body).
    // C++23 (P2718R0): Well-defined; all temporaries in initializer extend across loop.
    for (int v : make_holder().items) {
        total += v;
    }
    return total;
}
```

> **Pitfall.** Even in C++23, temporary lifetime extension protects only direct reference binding and range-for initializers—returning a view (`std::string_view`, `std::span`) or calling `.c_str()` on a temporary still dangles the moment the full-expression ends.

## What to remember

- **Storage duration** controls raw memory allocation; **object lifetime** starts only after initialization completes and ends when destruction begins or storage is reused.
- Never read members or call member functions on uninitialized or already-destroyed storage; use `std::construct_at` and `std::destroy_at` to manage raw buffers cleanly.
- Use C++20 **implicit-lifetime types** and C++23 **`std::start_lifetime_as`** instead of pointer punning when interpreting raw byte buffers in place.
- Capture placement `new`'s return pointer or apply **`std::launder`** whenever replacing an object whose class has `const` or reference members.
- Remember that C++23 extended temporary lifetimes inside **range-for initializers** (`P2718R0`), while view types and accessors on temporaries outside range-for still dangle at the semicolon.
