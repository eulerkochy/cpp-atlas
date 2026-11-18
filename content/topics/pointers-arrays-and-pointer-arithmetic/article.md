---
title: "Pointers, arrays and pointer arithmetic"
summary: "A pointer value is not just an address; it points to an object, past the end of one, nowhere, or it is invalid. This page covers array-to-pointer decay and where it stops, what arithmetic and comparison the standard defines, multidimensional arrays, function pointers, nullptr, references and std::to_address."
track: "memory-model"
minutes: 14
standard:
  - "[basic.compound]"
  - "[basic.stc.general]"
  - "[conv.array]"
  - "[dcl.fct]"
  - "[expr.add]"
  - "[expr.rel]"
  - "[expr.eq]"
  - "[comparisons.general]"
  - "[basic.fundamental]"
  - "[dcl.ref]"
  - "[pointer.conversion]"
cppreference:
  - title: "Pointer declaration"
    path: "language/pointer"
  - title: "Array declaration"
    path: "language/array"
  - title: "Additive operators"
    path: "language/operator_arithmetic"
  - title: "Comparison operators"
    path: "language/operator_comparison"
  - title: "std::less"
    path: "utility/functional/less"
  - title: "std::nullptr_t"
    path: "types/nullptr_t"
  - title: "std::to_address"
    path: "memory/to_address"
prerequisites:
  - "object-lifetime-and-storage"
  - "strict-aliasing-and-undefined-behavior"
---

## The one idea

The hardware sees an address. The abstract machine sees a pointer value, and [basic.compound] says every value of an object pointer type is exactly one of four things: a pointer to an object, a pointer past the end of an object, the null pointer value, or an invalid pointer value. Arithmetic, comparison and dereference are all defined in terms of which of the four you hold and which object it relates to, never in terms of the bits.

> **Mental model.** A pointer is an address plus a claim about which object it belongs to. The address says where; the claim says what you may do. Two pointers can hold the same address and still have different values, because one points to an object and the other points past the end of its neighbour.

The topic on strict aliasing introduces this idea, which is often called provenance, and the type-access rules that go with it. This page works through the rest of the pointer model.

## Four kinds of pointer value

A pointer past the end of an object represents the first byte after it. You may form it, copy it, compare it and subtract it, but you may not dereference it. Every object counts as an array of one element for this purpose, so `&x + 1` is a valid past-the-end pointer even for a scalar.

A pointer becomes invalid when the storage it points into reaches the end of its duration: after `delete`, after the block holding an automatic variable exits, after `free`. Dereferencing an invalid pointer, or passing it to a deallocation function, is undefined. Every other use, including copying it, comparing it, or printing it, is implementation-defined, because some architectures trap when an invalid address is merely loaded into a register.

```cpp
int* dangling() {
  int* p = new int(1);
  delete p;          // p now holds an invalid pointer value
  int* q = p;        // implementation-defined, not undefined
  return q;          // *q, or delete q, would be undefined
}
```

Equality between a past-the-end pointer and a pointer to some unrelated object is a trap of its own. If `a` and `b` happen to be adjacent, `a + 1` and `&b` may have the same address. [expr.eq] makes the result of `a + 1 == &b` unspecified in that case, which lets an optimizer fold it to `false` in one place and compute `true` in another; GCC has been observed doing exactly that.

## Array-to-pointer decay and where it stops

An lvalue or rvalue of type "array of N `T`" converts to a prvalue `T*` pointing to the first element. This conversion happens in almost every expression, which is why arrays look like pointers. It does not happen in these places:

- the operand of `sizeof`, `decltype`, `typeid` and unary `&`;
- binding a reference to the array, including deducing `T` for a `const T&` parameter;
- initializing a `char` array from a string literal;
- the range of a range-based `for`, and a structured binding declaration;
- a lambda capture by copy, which copies the whole array.

The most surprising rule runs the other way. A function parameter declared as an array is adjusted to a pointer, so `void f(int a[10])` declares `void f(int* a)`, and the `10` is ignored.

```cpp
#include <type_traits>

int a[4];
static_assert(std::is_same_v<decltype(a), int[4]>);       // no decay in decltype
static_assert(std::is_same_v<decltype(&a), int(*)[4]>);   // pointer to the whole array
static_assert(std::is_same_v<decltype(+a), int*>);        // unary + forces decay

void f(int p[10]) {
  static_assert(std::is_same_v<decltype(p), int*>);       // the parameter is a pointer
}

template <class T> constexpr bool by_value(T)      { return std::is_array_v<T>; }
template <class T> constexpr bool by_ref(const T&) { return std::is_array_v<T>; }
static_assert(!by_value(a) && by_ref(a));                 // T is int* vs int[4]
```

`&a` and `a` usually hold the same address but have different types, so `&a + 1` steps over the whole array while `a + 1` steps over one `int`.

## Arithmetic stays inside one array

[expr.add] defines `P + J` only when `P` points to element `i` of an array of `n` elements and `0 <= i + J <= n`. Anything else is undefined, whether or not the result is dereferenced. Subtraction `P - Q` is defined only when both point into, or one past the end of, the same array, and gives `i - j` as a `std::ptrdiff_t`.

`std::ptrdiff_t` is a signed type, and `std::size_t` can describe larger objects than it can measure. If an array of `char` is longer than `PTRDIFF_MAX` bytes, subtracting pointers at its two ends gives a difference that is not representable, and the behavior is undefined. On 64-bit systems no allocation is that large in practice. On 32-bit systems a buffer of more than 2 GB is conceivable, which is one reason GCC refuses to declare an object larger than `PTRDIFF_MAX` and glibc's `malloc` refuses such requests.

### Multidimensional arrays

`int m[3][4]` is an array of three arrays of four `int`. It decays to `int (*)[4]`, and `m[i]` is itself an array that decays to `int*`. The twelve `int` objects are contiguous, but they are not one array of twelve. A pointer obtained from `m[0]` belongs to a four-element array, so `&m[0][0] + 4` is its past-the-end pointer, and `(&m[0][0])[5]` is out of bounds even though `m[1][1]` lives at that address.

```cpp
constexpr int flat() {
  int m[2][3] = {{1, 2, 3}, {4, 5, 6}};
  int* p = &m[0][0];
  return p[3];   // undefined: p points into m[0], which has three elements
}
// constexpr int v = flat();   // rejected by GCC 16 and Clang 21 as not a constant expression
```

Code that walks a matrix with a single `int*` is common and works on every mainstream compiler, but the standard does not bless it. `std::mdspan` in C++23, covered in the topic on span and mdspan, is the sanctioned way to view one flat buffer as several dimensions.

> **Pitfall.** Treating an object as bytes and stepping through it with `unsigned char*` is universally relied on, for example in `memcpy` implementations and hashing, but the C++23 wording does not clearly define pointer arithmetic over an object's representation. The proposal P1839 addresses that gap. Prefer `std::memcpy`, `std::bit_cast` or `std::as_bytes` where you can.

## Comparing pointers

Equality with `==` and `!=` works for any two pointers of compatible type, with the past-the-end caveat already described. Relational comparison with `<` and friends is specified only within one object: later array elements compare greater, and later-declared non-static data members compare greater provided neither is a zero-size subobject. Before C++23 that member rule also required the members to have the same access; P1847 dropped the condition. For pointers to unrelated objects the result is unspecified, not undefined, which differs from C, where such a comparison is undefined.

```cpp
struct P { int a; int b; };

constexpr bool members_ordered() {
  P p{};
  return &p.a < &p.b;            // guaranteed true: b is declared later
}
static_assert(members_ordered());

bool unrelated(int& x, int& y) {
  return &x < &y;                // unspecified result, and never a constant expression
}
```

`std::less<T*>`, `std::ranges::less` and the other comparison function objects are guaranteed to yield an implementation-defined strict total order over pointers, consistent with the built-in operators wherever those are specified. That is why `std::set<T*>` and `std::map<T*, V>` work. The guarantee does not make the result usable in constant evaluation for unrelated pointers; both GCC 16 and Clang 21 reject that.

> **Standardese.** [expr.rel] says that when two pointers do not point into the same array or into the same object, neither is required to compare greater than the other, and [comparisons.general] separately requires `std::less` and its relatives to produce an implementation-defined strict total order consistent with the built-in operators.

## Pointer-interconvertibility, function pointers and nullptr

Two objects are pointer-interconvertible when a `reinterpret_cast` between pointers to them yields a pointer to the other object: a standard-layout class object and its first non-static data member, a union and its members, and an object and itself. The strict-aliasing topic explains why other casts only relabel the pointer. C++20 added `std::is_pointer_interconvertible_with_class(&S::m)` to test the member case; GCC 16 supports it and libc++ in LLVM 21 does not yet.

A function name decays to a pointer to function, and a function pointer cannot take part in arithmetic. Function pointers may be converted to other function pointer types with `reinterpret_cast`, and converting back yields the original, but calling through the wrong type is undefined. Converting a function pointer to `void*` is conditionally-supported; POSIX requires it, which is how `dlsym` works.

`nullptr` is a prvalue of type `std::nullptr_t`, which is neither a pointer type nor an integer type. It converts to every pointer and pointer-to-member type, but not to `int`. It converts to `bool` only in direct-initialization, as in `bool b(nullptr);`, and `bool b = nullptr;` is ill-formed. `NULL` is an implementation-defined null pointer constant, often `0` or `0L`, so `g(NULL)` may pick the integer overload or be ambiguous; `nullptr` always selects the pointer overload.

```cpp
#include <cstddef>

void g(int);
void g(char*);

void call() {
  g(nullptr);    // g(char*)
  g(0);          // g(int)
}

static_assert(sizeof(std::nullptr_t) == sizeof(void*));   // guaranteed by [basic.fundamental]
```

## References, and std::to_address

A reference is an alias, not an object. It has no address of its own, `sizeof` on a reference type yields the size of the referenced type, and [dcl.ref] leaves it unspecified whether a reference requires storage at all. Implementations represent a reference member or parameter as a pointer when they need storage, and a local reference to a known object usually needs none. A reference cannot be null in a valid program: forming one from a null pointer is already undefined. It also cannot be reseated, which is why a reference member makes a class's implicit copy assignment operator deleted.

C++20's `std::to_address(p)` returns a raw pointer equal to what `p` points to, without dereferencing. For a raw pointer it returns `p`. For a fancy pointer or a contiguous iterator it uses `std::pointer_traits<P>::to_address` if provided, and otherwise calls `p.operator->()` and recurses. The practical use is getting a raw pointer from an end iterator, where `&*it` would dereference a past-the-end iterator.

```cpp
#include <memory>
#include <vector>

int* end_pointer(std::vector<int>& v) {
  return std::to_address(v.end());   // OK; &*v.end() would be undefined
}
```

## What to remember

- A pointer value points to an object, points past the end of one, is null, or is invalid. Equal addresses do not imply equal values.
- Dereferencing or deleting an invalid pointer is undefined; any other use of it, even copying, is implementation-defined.
- `p + 1 == &other` with `p` past the end is unspecified.
- Arrays decay almost everywhere, except under `sizeof`, `decltype`, unary `&`, reference binding and a few initializations. Array parameters are really pointers.
- Arithmetic is defined only within one array plus one past the end; `ptrdiff_t` overflow in subtraction is undefined.
- `int m[3][4]` is three arrays of four, not one of twelve; indexing past a row is undefined. Use `std::mdspan`.
- `<` on unrelated pointers is unspecified in C++ (undefined in C); `std::less` gives a total order.
- Function pointers do no arithmetic, and calling through a mismatched type is undefined.
- `nullptr` converts to pointers but not integers, and to `bool` only by direct-initialization; `sizeof(std::nullptr_t) == sizeof(void*)`.
- References are not objects and may not occupy storage; `std::to_address` (C++20) gets a raw pointer without dereferencing.
