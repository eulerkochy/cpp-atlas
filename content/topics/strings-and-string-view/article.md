---
title: "Strings and string_view"
summary: "std::string owns a contiguous, always null-terminated buffer and invalidates like a vector. std::string_view is a non-owning pointer and length pair, not null-terminated, whose main hazard is outliving the thing it looks at."
track: "containers"
minutes: 12
standard:
  - "[basic.string]"
  - "[string.require]"
  - "[string.access]"
  - "[string.capacity]"
  - "[string.cons]"
  - "[string.view]"
  - "[string.view.cons]"
  - "[char.traits]"
cppreference:
  - title: "std::basic_string"
    path: "string/basic_string"
  - title: "std::basic_string::resize_and_overwrite"
    path: "string/basic_string/resize_and_overwrite"
  - title: "std::basic_string_view"
    path: "string/basic_string_view"
  - title: "std::char_traits"
    path: "string/char_traits"
prerequisites:
  - "iterator-invalidation"
  - "reference-binding-and-temporaries"
---

## The one idea

`std::string` and `std::string_view` are two answers to different questions. A `string` answers "who owns these characters?" It owns a heap or inline buffer, frees it, and can grow it. A `string_view` answers "where are these characters?" It is a pointer and a length, nothing more, and it says nothing about how long the characters will stay there.

Everything else follows. A `string` behaves like a `vector<char>` with a terminator: contiguous, reallocating, invalidating. A `string_view` behaves like a borrowed reference that you can copy cheaply, slice for free, and accidentally leave dangling.

> **Mental model.** A `string` is a buffer you own. A `string_view` is a borrowed window onto someone else's buffer. Copy the window as much as you like, but the owner must outlive every use of it.

## What `std::string` guarantees

The characters are stored contiguously, so `&s[0] + n == &s[n]` for every valid `n`, and `data()` can be handed to any C API that wants a pointer and a length. Since C++11 the buffer is also always null-terminated: `data()` and `c_str()` are the same function, and `data()[size()]` is a valid read that yields `'\0'`. This is why `s[s.size()]` is legal for reading, and why `at(s.size())` still throws `std::out_of_range`.

```cpp
#include <string>

void demo() {
  const std::string s = "abc";
  char c = s[s.size()];       // OK: reads the terminator, c == '\0'
  // s.at(s.size());          // throws std::out_of_range
  // s[s.size() + 1];         // undefined behavior
  (void)c;
}
```

The terminator is yours to read, not to change. For the non-const `operator[]`, writing anything other than `'\0'` to position `size()` is undefined behavior. Embedded null characters are fine, but then `c_str()` is only a C string up to the first one.

> **Standardese.** [string.access] says `operator[]` with `pos == size()` returns a reference to an object with value `charT()`, and that modifying it to any other value is undefined behavior. [string.require] requires the range `[data(), data() + size()]` to be valid, with the terminator at the end.

### Small string optimization is practice, not promise

Every mainstream implementation stores short strings inside the `string` object itself, so no allocation happens for them. The thresholds differ. On this 64-bit machine, libstdc++ keeps up to 15 characters inline in a 32-byte object, and libc++ keeps up to 22 in a 24-byte object. The standard promises neither number, and it does not even mention the optimization. What it does promise is that `capacity()` is at least `size()`, and `reserve` and `shrink_to_fit` obey their usual rules.

The practical consequence is that "pointer into a short string" is a pointer into the string object. Move it, swap it, or let it be destroyed, and the pointer goes with it. Never reason that a short string is "safe" because it did not allocate; follow the invalidation rules instead.

### Invalidation

Pointers, references and iterators into a `string` can be invalidated by any standard function that takes the string by non-const reference (`std::swap`, `std::getline`, `operator>>`) and by calling any non-const member function except `operator[]`, `at`, `data`, `front`, `back` and the `begin`/`end` family. In practice that means growth, `insert`, `erase`, `clear` and `reserve` should all be assumed to invalidate. This is close to the rule for `vector`, and the topic on iterator invalidation covers the machinery.

## `resize_and_overwrite`, `npos` and the new queries

Before C++23, filling a string from a C API meant `s.resize(n)`, which writes `n` zero bytes, and then overwriting them. `resize_and_overwrite(count, op)` hands your callable a pointer to storage for `count` characters and uses the integer it returns as the new size. The characters in the buffer beyond what you had before are indeterminate, so you must write every one you report.

```cpp
#include <cstdio>
#include <string>

std::string format_int(int v) {
  std::string s;
  s.resize_and_overwrite(12, [v](char* p, std::size_t n) {
    // snprintf writes the digits and a terminator, and returns the length
    return static_cast<std::size_t>(std::snprintf(p, n + 1, "%d", v));
  });
  return s;
}
```

The callable must not throw, must not modify `p` or `count`, and must return a value in `[0, count]`. Returning a length that includes characters you never wrote is undefined behavior, because the string would read indeterminate values. Every iterator, pointer and reference into the string is invalidated, even if no reallocation happened.

`std::string::npos` is `static_cast<size_type>(-1)`, the largest value of the unsigned size type. Every `find` family function returns it on failure, and it doubles as "until the end" for a length argument, so `s.substr(pos)` is the same as `s.substr(pos, npos)`. The recurring bug is treating the result as a signed index:

```cpp
#include <string>

void idioms(const std::string& s) {
  if (s.find('/') != std::string::npos) { /* found */ }
  std::size_t i = s.find('/');
  std::size_t next = i + 1;  // 0 when i == npos: unsigned wraparound
  (void)next;
}
```

When you only need a yes or no, C++20 gave `starts_with` and `ends_with`, and C++23 gave `contains`, each taking a character, a `string_view` or a C string. They say what you mean without an `npos` comparison.

## What `std::string_view` is

A `string_view` holds a `const char*` and a length. It is trivially copyable, `constexpr` throughout, and constructing one never allocates or copies characters. It can be built from a `std::string`, from a C string (which costs a `strlen`), from a pointer and length, and since C++23 from any contiguous range of `char` through an explicit constructor. Constructing one from `nullptr` is deleted in C++23.

```cpp
#include <string>
#include <string_view>

void view_basics() {
  std::string s = "hello";
  std::string_view sv = s;        // no copy, points at s's buffer
  s[0] = 'J';                     // sv now sees "Jello"
  sv.remove_prefix(1);            // moves sv's start; s is untouched
  std::string_view tail = sv.substr(1);  // O(1), unlike std::string::substr
  (void)tail;
}
```

Two properties set it apart from a `string`. First, a view has no terminator of its own: `sv.data()[sv.size()]` is not guaranteed to be anything, and in a slice such as `sv.substr(0, 5)` the byte after the end is simply the next character of the original text. Passing `data()` to a function expecting a C string reads past the view, as the next example does.

```cpp
#include <cstdio>
#include <string_view>

void leak() {
  std::string_view whole = "hello world";
  std::string_view w = whole.substr(0, 5);
  std::printf("%s\n", w.data());  // prints "hello world", not "hello"
}
```

Second, it does not own. The characters belong to whatever the view was made from, and the view's lifetime must fit inside theirs.

> **Pitfall.** Initializing a view from an expression that creates a temporary string leaves the view dangling at the end of the full expression. `std::string_view sv = s + "x";` compiles, and every later use of `sv` is undefined behavior. Neither GCC nor Clang rejects it by default, though recent Clang warns about some forms, and constant evaluation catches it.

```cpp
#include <string>
#include <string_view>

std::string name();

void dangling() {
  std::string_view a = name();            // dangling: the temporary dies at the semicolon
  std::string s = "abc";
  std::string_view b = s + "x";           // dangling for the same reason
  std::string_view ok = s;                // fine while s lives and is not reallocated
  (void)a; (void)b; (void)ok;
}
```

A view also dangles when its owner is modified: `s += "more"` may reallocate and leave `ok` pointing at freed memory, which is the same invalidation rule as for pointers.

## Conversions and parameters

`std::string` converts to `std::string_view` implicitly, through a conversion operator on `string`. The other direction is explicit, through a constructor template on `string`. The asymmetry is about cost and honesty: the first conversion is free and cannot fail, while the second allocates and copies, and the language lets you hide neither.

```cpp
#include <string>
#include <string_view>

void takes_view(std::string_view);
void takes_string(const std::string&);

void conv(std::string s, std::string_view v) {
  takes_view(s);                    // implicit, free
  // std::string t = v;             // ill-formed: explicit constructor
  std::string t{v};                 // OK: allocates and copies
  s = v;                            // OK: assignment from a view is provided directly
  s += v;                           // OK
  // takes_string(v);               // ill-formed for the same reason as above
  takes_string(std::string(v));     // OK
}
```

That shapes how functions should take text. A parameter of type `const std::string&` forces a temporary `string` for every string literal and every view the caller holds, and that construction allocates once the text exceeds the small-string capacity. A `std::string_view` parameter accepts a `string`, a literal and a view with no allocation. Use `string_view` for read-only parameters, and keep `std::string` when the function stores the text, because storing a view stores a promise someone must keep.

A view parameter is wrong when the callee needs a terminator, as C APIs do. A `const std::string&` or `const char*` is the honest type there. It is also a trap to store a view in a member, unless the owner's lifetime is guaranteed to cover it.

There is no `operator+` between a view and a C string, so `sv + "c"` is ill-formed. C++26 adds overloads that accept one `string` and one `string_view` operand, but still nothing for two views.

## Literals and `char_traits`

The suffix `s` in `"abc"s` makes a `std::string`, and `sv` in `"abc"sv` makes a `std::string_view` whose length is known at compile time, so even a literal with embedded nulls keeps all its characters. Both live in `std::literals` and need a `using namespace std::literals;` or a more specific using-directive. Prefer `sv` for constants, because a `constexpr std::string_view` never allocates and can be used in constant expressions.

Both classes are really `basic_string<CharT, Traits, Allocator>` and `basic_string_view<CharT, Traits>`. `char_traits` supplies the character comparison, copy and length operations, which is why `std::string` and `std::u8string` are the same template with different parameters, and why a case-insensitive string is a different type, not a flag. Different traits mean different, non-interchangeable types.

## What to remember

- `string` owns and reallocates like `vector`; `string_view` is a non-owning pointer and length.
- Since C++11 `data()` and `c_str()` are the same, and `data()[size()]` is a readable `'\0'`; writing anything else there is undefined.
- Small string optimization is an implementation habit with different thresholds; rely on the invalidation rules, not on "short strings do not move".
- `resize_and_overwrite` (C++23) avoids zero-filling, but every reported character must be written and the callable must not throw.
- `find` returns `npos`, an unsigned maximum; adding one to it wraps to zero. Prefer `starts_with`, `ends_with` and `contains` for yes or no questions.
- A `string_view` is not null-terminated, and a view initialized from a temporary string, such as `s + "x"`, dangles at the end of the statement.
- `string` converts to `string_view` implicitly; the reverse is explicit, because it allocates.
- Take `string_view` for read-only text, `std::string` for text you keep, and a `const char*` or `const std::string&` when a terminator is required.
