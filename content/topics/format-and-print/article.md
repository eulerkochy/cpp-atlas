---
title: "std::format and std::print"
summary: "std::format replaces printf and iostream formatting with a type-safe format string that is checked at compile time and extended through formatter specializations. C++23 adds range and tuple formatting and std::print, which writes directly to a stream with Unicode awareness."
track: "utilities"
minutes: 13
standard:
  - "[format.string]"
  - "[format.string.std]"
  - "[format.functions]"
  - "[format.formatter.spec]"
  - "[format.range]"
  - "[format.tuple]"
  - "[print.fun]"
cppreference:
  - title: "std::format"
    path: "utility/format/format"
  - title: "Standard format specification"
    path: "utility/format/spec"
  - title: "std::formatter"
    path: "utility/format/formatter"
  - title: "std::vformat"
    path: "utility/format/vformat"
  - title: "std::runtime_format"
    path: "utility/format/runtime_format"
  - title: "std::format_to_n"
    path: "utility/format/format_to_n"
  - title: "std::print"
    path: "io/print"
  - title: "std::format_error"
    path: "utility/format/format_error"
prerequisites:
  - "variadic-templates-and-fold-expressions"
  - "concepts-and-constraints"
  - "strings-and-string-view"
---

## The one idea

A format string is a tiny program with two kinds of parts: literal text, and replacement fields in braces. Each replacement field names an argument and hands a format specification to a `std::formatter<T>` for that argument's type. The formatter has two jobs: `parse` reads the specification and `format` writes the result. Everything in the library, from `{:>8.3f}` to a range of tuples, is built from that one handshake.

Two design decisions set `std::format` apart from `printf` and iostreams. The format string is a `consteval` constructor argument, so errors in it are compile errors. And formatting is separated from output: `std::format` builds a string, `std::format_to` writes through an iterator, `std::print` writes to a stream, and all three share the same formatters.

> **Mental model.** `std::format(fmt, args...)` first checks `fmt` against the argument types at compile time, then type-erases the arguments and runs each formatter over its own piece of the string.

## The replacement field and the standard spec

A replacement field is `{`, an optional argument index, an optional `:` followed by a specification, and `}`. Write `{{` and `}}` for literal braces. Indices must be all present or all absent: mixing `{}` with `{0}` is an error.

For built-in types the specification has a fixed order: fill and align, sign, `#`, `0`, width, precision, `L`, then type.

```cpp
#include <format>
#include <print>

int main() {
  std::println("[{:*^9}]", "mid");            // [***mid***]  fill '*', centered
  std::println("[{:>8.3f}]", 3.14159);        // [   3.142]
  std::println("{:+d} {:#x} {:#010b}", 5, 255, 5);  // +5 0xff 0b00000101
  std::println("{1} {0} {1}", "a", "b");      // b a b
  std::println("[{:{}}]", 7, 5);              // [    7]  width from argument 1
  std::println("{:.{}f}", 3.14159, 2);        // 3.14
}
```

Defaults differ by type. Numbers align right and strings align left, so `{:5}` pads `42` on the left and `"ab"` on the right. Precision on a string truncates it, and on a floating-point value it counts digits after the point for `f` and `e`. Width and precision can come from another argument with a nested `{}`, but that argument must be a standard integer type and not negative, otherwise `format_error` is thrown.

Details that surprise people:

- `bool` prints as `true` or `false` by default, and as a number with `d`. A `char` prints as a character by default and as a number with `d`. Integers accept `c` to print as a character.
- With `#`, the width includes the `0x` or `0b` prefix, and the `0` option inserts zeros after the prefix and sign.
- The `0` option is ignored for infinity and NaN, which are padded with spaces. It is also ignored when an alignment is given.
- Pointers print through `{}` or `{:p}` as a `0x` address; only `void*`, `const void*` and `nullptr_t` are formattable, not arbitrary object pointers.
- Floating-point output with no type letter is the shortest representation that round-trips, as `std::to_chars` would produce.

> **Standardese.** [format.string.std] defines the grammar for the standard specifiers, and says the padding width is measured in estimated display columns, not bytes. For a Unicode string, wide East Asian characters count as two columns.

## Compile-time checking, `vformat`, and runtime strings

The first parameter of `std::format` is a `std::format_string<Args...>`, whose converting constructor is `consteval`. It runs each `formatter::parse` at compile time against the real argument types. A dangling brace, a bad index, `{:d}` on a string, or `{:>6}` on a type whose formatter accepts no specification all fail to compile.

```cpp
#include <format>
#include <string>

std::string a = std::format("{}", 42);   // OK: literal checked at compile time
// std::format("{:d}", "text");          // ill-formed: d is not valid for strings
// std::format("{} {}", 1);              // ill-formed: too few arguments

std::string f = "{}";
// std::format(f, 1);                    // ill-formed: f is not a constant expression
```

The cost of the safety is that a format string from a file or a translation catalog does not compile. The escape hatch is `std::vformat`, which takes an ordinary `std::string_view` and a pack made with `std::make_format_args`. Errors are then reported at run time by throwing `std::format_error`.

```cpp
#include <format>
#include <string>

std::string run(const std::string& fmt, int a, int b) {
  // make_format_args takes lvalues (since C++23): rvalues do not bind
  return std::vformat(fmt, std::make_format_args(a, b));
}
// run("{} + {}", 1, 2)   returns "1 + 2"
// run("{} {} {}", 1, 2)  throws std::format_error
```

C++26 adds `std::runtime_format(str)`, which wraps a string in an object that the `format_string` constructor accepts without checking, so `std::format(std::runtime_format(f), 1)` works and still throws on bad input. The C++26 feature was not yet available in GCC 16.2 on the machine used for these examples, so treat it as the future spelling of `vformat` and prefer `vformat` today.

## Writing your own formatter

To make a type formattable, specialize `std::formatter` for it. `parse` receives the text between the colon and the closing brace and returns an iterator to the `}`; `format` writes to the context's output iterator and must be `const`.

```cpp
#include <format>

struct Rgb { unsigned char r, g, b; };

template <>
struct std::formatter<Rgb> {
  bool hex = true;
  constexpr auto parse(std::format_parse_context& ctx) {
    auto it = ctx.begin();
    if (it != ctx.end() && (*it == 'x' || *it == 'd')) hex = (*it++ == 'x');
    if (it != ctx.end() && *it != '}') throw std::format_error("bad Rgb spec");
    return it;
  }
  auto format(const Rgb& c, std::format_context& ctx) const {
    return hex ? std::format_to(ctx.out(), "#{:02x}{:02x}{:02x}", c.r, c.g, c.b)
               : std::format_to(ctx.out(), "rgb({}, {}, {})", c.r, c.g, c.b);
  }
};
// std::format("{}", Rgb{255,0,16})   is "#ff0010"
// std::format("{:d}", Rgb{255,0,16}) is "rgb(255, 0, 16)"
```

Throwing from `parse` during compile-time checking turns into a compile error, which is how custom diagnostics are produced. A formatter that returns `ctx.begin()` without consuming anything accepts only an empty specification, so `{:>6}` on it is ill-formed. To support width and alignment for free, either inherit from `std::formatter<std::string_view>` and format into a temporary string, or pad it yourself: `std::format("{:>10}", std::format("{}", rgb))` works because the inner call produces a plain string.

Specializing `std::formatter` for your own type is allowed; the standard forbids specializing it for types you do not own, unless the specialization depends on a program-defined type.

## Ranges, tuples, and the other output functions

C++23 makes ranges, `std::pair`, and `std::tuple` formattable when their elements are. The defaults mirror the debug-friendly shape of the data: sequences print in brackets, sets in braces, maps as `{key: value}`, and tuples in parentheses with strings quoted.

```cpp
#include <format>
#include <map>
#include <print>
#include <tuple>
#include <vector>

int main() {
  std::vector<int> v{1, 2, 3};
  std::println("{}", v);                          // [1, 2, 3]
  std::println("{:n}", v);                        // 1, 2, 3  no brackets
  std::println("{::#x}", v);                      // [0x1, 0x2, 0x3]  :: is the element spec
  std::println("{}", std::make_tuple(1, "x", 2.5)); // (1, "x", 2.5)
  std::println("{}", std::map<int, int>{{1, 2}});   // {1: 2}
}
```

In a range specification, the part before the second colon applies to the range as a whole and the part after it applies to each element, which is why `{::#x}` has two colons.

The other functions differ in where the text goes:

- `std::format_to(out, fmt, args...)` writes through an output iterator and returns the end iterator. Use `std::back_inserter` for strings.
- `std::format_to_n(out, n, fmt, args...)` writes at most `n` characters and returns the end iterator and `size`, which is the length the full output would have had, not the truncated length. This is the same idea as `snprintf`'s return value.
- `std::formatted_size(fmt, args...)` returns the length without writing anything, so you can size a buffer first.

## `std::print`, Unicode, and locale

`std::print` and `std::println` (C++23, header `<print>`) format and write in one step, to `stdout` or to a `FILE*`. They are not just `std::cout << std::format(...)`. The stream is locked for the write, and if it refers to a terminal that can display Unicode only through a native API, the text is sent through that API instead of as raw bytes, so it arrives intact whatever the console code page is. This path is used when the ordinary literal encoding is UTF-8; otherwise the text is written unmodified. Invalid UTF-8 sent to such a terminal is undefined behavior, so do not print arbitrary bytes through it.

Width measurement for fill and alignment is also encoding-aware. When the literal encoding is UTF-8, the library estimates display columns, so `"{:>6}"` on `"日本"` pads with two spaces because each character takes two columns. For other encodings the method of measuring is unspecified.

Locale is opt-in. A plain `{}` is locale-independent: it ignores the global locale. Adding `L` (as in `{:L}`) uses the locale's digit grouping, decimal point, and `true`/`false` names. Overloads that take a `std::locale` as the first argument supply a specific locale for `L` to use.

## Errors, and how this compares with older tools

There are two failure channels. A malformed format string with a compile-time-checkable string is ill-formed. Everything else, such as a bad string through `vformat`, an invalid dynamic width, or a formatter that rejects a specification, throws `std::format_error`. Output functions can also throw `std::bad_alloc`, or whatever the destination iterator or stream throws.

| Tool | Type safety | Extensible | Locale by default | Cost model |
| --- | --- | --- | --- | --- |
| `printf` | None: wrong specifier is UB | No | Yes, global C locale | Varargs, parsed at run time |
| iostreams | Yes | `operator<<` | Yes, imbued locale | Virtual calls, sticky state |
| `std::format` | Yes, at compile time | `formatter` | Only with `L` | Type-erased arguments, no stream state |

The practical consequences: no sticky flags such as `std::hex` leak into later output, argument order can be changed by a translator with `{1}` and `{0}`, and the same formatter works for strings, buffers, and streams. What you lose is the ability to stream to an arbitrary `std::ostream` through `<<`. A type with `operator<<` is not automatically formattable; you need a `formatter`, and C++23 offers `std::ostream` overloads of `std::print` to send formatted text into one.

## What to remember

- A format string is parsed by `formatter<T>::parse` and written by `formatter<T>::format`; the standard spec order is fill, align, sign, `#`, `0`, width, precision, `L`, type.
- `format_string` checks the string at compile time; a non-constant string needs `vformat` with `make_format_args` (lvalues only), and C++26 adds `runtime_format`.
- Mixing automatic and manual indices is an error.
- `format_to_n` reports the untruncated size.
- `0` padding is ignored for inf and NaN, and `#` prefixes count towards the width.
- Ranges, pairs, and tuples are formattable in C++23; `{::spec}` reaches the elements.
- Locale only matters with `L`, which is valid only for arithmetic types.
- `std::print` is C++23, locks the stream while it writes, and uses Unicode-aware terminal output when the literal encoding is UTF-8.
- Runtime errors are `std::format_error`; custom formatters report bad specifications by throwing it from `parse`.
