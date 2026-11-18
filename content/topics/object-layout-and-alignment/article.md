---
title: "Object layout and alignment"
summary: "What the standard actually promises about sizeof, alignof, member order and padding, which class properties unlock byte-level tricks, and where the standard stops and the ABI takes over."
track: "memory-model"
minutes: 13
standard:
  - "[basic.align]"
  - "[basic.types.general]"
  - "[intro.object]"
  - "[intro.memory]"
  - "[class.mem]"
  - "[class.prop]"
  - "[class.bit]"
  - "[dcl.attr.nouniqueaddr]"
  - "[expr.sizeof]"
  - "[support.types.layout]"
cppreference:
  - title: "Object (size, alignment, representation)"
    path: "language/object"
  - title: "alignas specifier"
    path: "language/alignas"
  - title: "Empty base optimization"
    path: "language/ebo"
  - title: "C++ attribute: no_unique_address"
    path: "language/attributes/no_unique_address"
  - title: "Bit-field"
    path: "language/bit_field"
  - title: "std::has_unique_object_representations"
    path: "types/has_unique_object_representations"
  - title: "offsetof"
    path: "types/offsetof"
prerequisites:
  - "object-lifetime-and-storage"
---

## The one idea

The standard describes layout as a set of relationships, not a set of numbers. It promises that members appear in declaration order, that every object is suitably aligned, that `sizeof` counts padding, and that certain classes can be treated as raw bytes. The actual offsets, padding amounts and vtable shapes come from the platform ABI, such as the Itanium C++ ABI used by GCC and Clang on Linux and macOS, or the MSVC ABI on Windows.

> **Mental model.** Ask two separate questions about any layout claim. First, does the standard guarantee it, so it holds on every conforming implementation? Second, does my ABI guarantee it, so it holds for this compiler, target and flag set? Most layout bugs come from answering the second question and believing you answered the first.

## Size, alignment and padding

Every complete object type has a size, given by `sizeof`, and an alignment, given by `alignof`. The alignment is a power of two, and an object of that type may only live at an address that is a multiple of it. Arrays have no gaps between elements, and the size of an array of `n` elements is exactly `n` times the element size. Because every element must be aligned, `sizeof(T)` is always a multiple of `alignof(T)`. That is why padding appears at the end of a struct as well as in the middle.

The character types have size 1 by definition. The sizes of `bool`, `int`, pointers and every other fundamental type are implementation-defined. A byte is at least eight bits, and `CHAR_BIT` tells you how many.

Within a class, members are placed at increasing addresses in declaration order. Until C++20 that rule only applied among members with the same access control; C++23 adopted P1847, so the order now holds regardless of `public` and `private` sections. Between members, the implementation inserts whatever padding the alignment of the next member needs. The standard does not reorder members for you, so declaration order matters.

```cpp
struct A { char c; double d; char e; };   // c, 7 padding bytes, d, e, 7 tail padding bytes
struct B { double d; char c; char e; };   // d, c, e, 6 tail padding bytes

// Holds on x86-64 System V and AArch64 (Linux and Apple): double is 8-aligned
static_assert(sizeof(A) == 24 && sizeof(B) == 16);
```

On those ABIs the two structs look like this, one character per byte, with dots for padding.

```text
A: c . . . . . . . d d d d d d d d e . . . . . . .   24 bytes
B: d d d d d d d d c e . . . . . .                   16 bytes
```

### Over-aligned types

`alignas` raises the alignment of a type or variable. It cannot lower it below the natural alignment. Any alignment greater than `alignof(std::max_align_t)` is called extended, and support for each extended alignment is implementation-defined. Before C++17, `new` ignored extended alignment and could hand you a misaligned object. P0035, adopted in C++17, added the `operator new` overloads that take `std::align_val_t`. A new-expression now calls them automatically for any type whose alignment exceeds `__STDCPP_DEFAULT_NEW_ALIGNMENT__`.

```cpp
#include <cstdint>
struct alignas(64) CacheLine { char bytes[64]; };

int main() {
  auto* p = new CacheLine;   // C++17: calls operator new(size_t, align_val_t{64})
  bool ok = reinterpret_cast<std::uintptr_t>(p) % 64 == 0;   // guaranteed true
  delete p;                  // calls the matching aligned operator delete
  return ok ? 0 : 1;
}
```

The value of `alignof(std::max_align_t)` is a reminder of how platform-specific this is. Homebrew GCC 16 and Clang 21 on the same Apple arm64 machine report 16 and 8 respectively.

## The class-property vocabulary

Several class properties decide what you may do with an object's bytes. They are easy to mix up.

A **trivially copyable** class has at least one eligible copy or move operation, every eligible one is trivial, and its destructor is trivial and not deleted. That is the property that lets you copy an object with `memcpy` and get an equal object, and it is what `std::bit_cast` requires. Deleted operations are not eligible, so a class with a reference member is still trivially copyable, even though its copy assignment is deleted.

A **standard-layout** class has no virtual functions or virtual bases, uses the same access control for all non-static data members, declares all of those members in one class of its hierarchy, and meets a few rules about base classes. That property makes `offsetof` well-defined and makes the object pointer-interconvertible with its first member. It also makes the common-initial-sequence rule for unions apply, and it is the C-compatibility property.

**POD**, meaning trivial and standard-layout, is a legacy name. `std::is_pod` was deprecated in C++20 because no rule in the language needs the combination.

```cpp
#include <type_traits>
struct Ref { int& r; };                        // copy assignment is implicitly deleted
struct Dtor { int x; ~Dtor() {} };             // user-provided destructor
struct Mixed { public: int a; private: int b; };
static_assert(std::is_trivially_copyable_v<Ref>);    // deleted means not eligible
static_assert(!std::is_trivially_copyable_v<Dtor>);
static_assert(!std::is_standard_layout_v<Mixed>);    // mixed access control
```

> **Pitfall.** Trivially copyable does not mean "has no padding", and it does not mean "safe to compare with `memcmp`". Those are questions about the object representation, covered at the end of this page.

## Empty classes, the empty base optimization and no_unique_address

An empty class still has a size of at least 1 as a complete object, because two distinct objects of the same type must have distinct addresses. A base class subobject, however, may occupy zero bytes. That is the empty base optimization, and it is why policy classes and empty allocators are traditionally inherited from rather than stored as members.

C++20 added `[[no_unique_address]]`, which lets a non-static data member share its address with other members. The member becomes a potentially-overlapping subobject, like a base class. The attribute permits overlap but does not require it. The distinct-address rule still applies, so two empty members of the same type cannot both sit at the same offset.

```cpp
struct Empty {};
struct One { [[no_unique_address]] Empty e; int x; };
struct Two { [[no_unique_address]] Empty a; [[no_unique_address]] Empty b; int x; };

// Itanium ABI (GCC, Clang on Linux and macOS):
static_assert(sizeof(One) == 4);   // e overlaps x at offset 0
static_assert(sizeof(Two) == 4);   // a at 0, b at 1, both overlapping x
```

The MSVC ABI is different. MSVC accepts `[[no_unique_address]]` but ignores it, for ABI compatibility. Code that needs the effect there uses `[[msvc::no_unique_address]]`, so portable libraries usually hide the choice behind a macro.

## Bit-fields

A bit-field is a member with an explicit width in bits. Almost everything about how bit-fields are allocated is implementation-defined. That covers the size of the allocation unit, whether a field may straddle two units, and whether fields are filled from the low end or the high end. You cannot take a bit-field's address or apply `sizeof` to it, and a non-const reference cannot bind to one.

One bit-field rule is fully standard and matters a great deal for threads. A maximal run of adjacent bit-fields of nonzero width forms a single memory location. Two threads writing two different bit-fields in the same run, without synchronization, therefore have a data race. A zero-width unnamed bit-field, written `int : 0;`, ends the run and starts a new memory location.

```cpp
struct Flags {
  unsigned ready : 1;   // ready and dirty share one memory location
  unsigned dirty : 1;
  unsigned : 0;         // forces the next bit-field into a new allocation unit
  unsigned owner : 4;   // separate memory location: safe to write concurrently with ready
};
```

## Bases and vtables: ABI, not standard

The standard says almost nothing about how base classes, virtual functions and virtual bases are laid out. It does not mention a vtable at all. It only requires that polymorphic classes are not standard-layout, which is why `offsetof` on them is conditionally-supported since C++17 rather than well-defined.

The following describes the Itanium C++ ABI, which GCC and Clang use on Linux and macOS for both x86-64 and AArch64. A dynamic class stores a vtable pointer at offset 0. Its primary base shares that pointer and also sits at offset 0. Other non-virtual bases follow in declaration order, then the class's own members. Virtual bases are placed at the end of the most-derived object, and their offsets are stored in the vtable so that code can find them at run time. The MSVC ABI makes different choices, including a separate virtual-base-table pointer. None of this is portable knowledge, but all of it is stable within an ABI, which is what lets separately compiled libraries interoperate.

## Object representation and value representation

The object representation of a `T` is the sequence of `sizeof(T)` `unsigned char` objects it occupies. The value representation is the set of bits that determine its value. The bits in between are padding bits, and their contents are not part of the value. Assigning or aggregate-initializing a struct does not promise anything about its padding. Zero-initialization does set the padding bits to zero. It happens to every object with static storage duration, and value-initialization such as `T()` performs it for a class without a user-provided or deleted default constructor. Note that `T{}` on an aggregate is aggregate initialization, which makes no such promise about padding.

```text
struct P { char c; int i; };   // common ABIs: sizeof(P) == 8
offset: 0   1   2   3   4   5   6   7
        c   pad pad pad i   i   i   i
```

Two `P` objects with equal members can therefore differ in bytes 1 to 3, so `memcmp` and byte-wise hashing are unreliable for them. The C++17 trait `std::has_unique_object_representations_v<T>` is true only when equal values are guaranteed to have identical bytes. It is false for `P` on common ABIs because of the padding. It is also typically false for floating-point types, where `+0.0` and `-0.0` compare equal with different bits. Use it as a `static_assert` guard before hashing or comparing raw bytes.

> **Standardese.** [basic.types.general] promises that for a trivially copyable `T`, outside of potentially-overlapping subobjects, copying an object's underlying bytes into another `T` object makes it hold the same value. It promises nothing about comparing those bytes, because padding bits are outside the value representation.

## What to remember

- The standard gives relationships and the ABI gives numbers. Only state a concrete `sizeof` together with the ABI it comes from.
- `sizeof(T)` is a multiple of `alignof(T)`, character types have size 1, and every other fundamental size is implementation-defined.
- Members are allocated in declaration order, regardless of access control since C++23 (P1847). Sort members by decreasing alignment to cut padding.
- Since C++17, `new` honors extended alignment through the `std::align_val_t` overloads.
- Trivially copyable means `memcpy` and `std::bit_cast` work. Standard-layout means `offsetof` and C compatibility. POD is a deprecated name for both together.
- Empty bases may take zero bytes. `[[no_unique_address]]` (C++20) does the same for members, except under MSVC, which needs `[[msvc::no_unique_address]]`.
- Bit-field allocation is implementation-defined, but adjacent nonzero-width bit-fields are one memory location, which matters for data races.
- Vtables and base placement are Itanium or MSVC ABI facts, not standard facts.
- Padding bits are not part of the value, so check `std::has_unique_object_representations_v` before hashing or comparing bytes.
