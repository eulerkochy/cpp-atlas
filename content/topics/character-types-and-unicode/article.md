---
title: "Character types and Unicode"
summary: "C++ has six character types and four literal prefixes, but only the library's code-unit view of text. Knowing what a char holds, which encoding a literal gets, and what counts as a character for the reader is what keeps Unicode code correct."
track: "utilities"
minutes: 13
standard:
  - "[basic.fundamental]"
  - "[lex.charset]"
  - "[lex.phases]"
  - "[lex.ccon]"
  - "[lex.string]"
  - "[lex.universal.char]"
  - "[lex.string.uchar]"
  - "[format.string.std]"
  - "[depr.locale.stdcvt]"
  - "[depr.conversions]"
cppreference:
  - title: "Fundamental types"
    path: "language/types"
  - title: "Character literal"
    path: "language/character_literal"
  - title: "String literal"
    path: "language/string_literal"
  - title: "Escape sequences"
    path: "language/escape"
  - title: "Character sets and encodings"
    path: "language/charset"
  - title: "std::isalpha"
    path: "string/byte/isalpha"
  - title: "std::codecvt_utf8"
    path: "locale/codecvt_utf8"
  - title: "Format specification"
    path: "utility/format/spec"
  - title: "std::text_encoding"
    path: "text/text_encoding"
prerequisites:
  - "fundamental-types-and-arithmetic-conversions"
  - "strings-and-string-view"
---

## The one idea

A C++ character type is an integer type that holds one **code unit**, which is a piece of an encoded string, not necessarily a character that a person would point to. A `char` of a UTF-8 string is one byte. A `char16_t` of a UTF-16 string is half of a surrogate pair for most emoji. Everything in this topic follows from asking which of three things you are counting: code units, code points, or what a reader sees as one character, called a grapheme cluster.

> **Mental model.** `std::string`, `std::u8string`, `std::u16string` and `std::u32string` are arrays of code units. The standard library, apart from a few narrow facilities, never looks inside them. Anything that needs code points or grapheme clusters, such as normalization, case folding or segmentation, is your job or a third-party library's.

## The six character types

`char`, `signed char` and `unsigned char` are three distinct types, even though `char` has the same representation as one of the other two. Which one is implementation-defined, and portable code must not rely on it. In practice `char` is signed on x86 Linux and unsigned on ARM Linux, and a plain `char` holding a byte above 127 gives a negative number where it is signed.

```cpp
#include <type_traits>

// All three are distinct types in every implementation.
static_assert(!std::is_same_v<char, signed char>);
static_assert(!std::is_same_v<char, unsigned char>);
```

`wchar_t` is the wide character type. Its size and its encoding are implementation-defined: it is 32 bits with UTF-32 on most Unix systems and 16 bits with UTF-16 on Windows. For that reason `wchar_t` is a poor choice for portable text.

`char16_t` and `char32_t` came with C++11 and are meant for UTF-16 and UTF-32 code units. Each has the same size, signedness and alignment as `std::uint_least16_t` and `std::uint_least32_t`. `char8_t` arrived in C++20 for UTF-8 code units, with the same size, signedness and alignment as `unsigned char`. It is a separate type, and it does not get the permission that `char`, `unsigned char` and `std::byte` have to alias other objects.

## Literal prefixes and their types

Each prefix selects an encoding and a type. The prefixes are `u8`, `u`, `U` and `L`, plus no prefix for ordinary literals.

| Literal | Element type | Encoding |
| --- | --- | --- |
| `"abc"` | `char` | ordinary literal encoding, implementation-defined |
| `u8"abc"` | `char8_t` since C++20, `char` before | UTF-8 |
| `u"abc"` | `char16_t` | UTF-16 |
| `U"abc"` | `char32_t` | UTF-32 |
| `L"abc"` | `wchar_t` | wide literal encoding, implementation-defined |

The ordinary and wide literal encodings are what the compiler uses when it writes your string into the program. GCC and Clang default to UTF-8, and you can change it with options such as GCC's `-fexec-charset`. The execution environment may have a completely different idea of text at run time, which is why printing a "UTF-8" literal can still produce garbage on a terminal configured differently.

```cpp
#include <iterator>

// Counting code units, not characters (the final element is the terminator).
constexpr auto a = std::size(u8"é");        // 3: U+00E9 is two UTF-8 code units
constexpr auto b = std::size(u"\U0001F600");     // 3: surrogate pair, two UTF-16 units
constexpr auto c = std::size(U"\U0001F600");     // 2: one UTF-32 unit
static_assert(a == 3 && b == 3 && c == 2);
```

A character literal holds a single code unit. `u'\U0001F600'` is ill-formed in C++23, because the code point needs two UTF-16 code units, while `U'\U0001F600'` is fine.

### The `char8_t` break

C++20 changed the type of UTF-8 literals from `const char` arrays to `const char8_t` arrays. Code that worked in C++17 stops compiling.

```cpp
// const char* p = u8"abc";
// OK in C++17, ill-formed in C++20: const char8_t* does not convert to const char*

// std::cout << u8"abc";
// OK in C++17, ill-formed in C++20: the overload for const char8_t* is deleted
```

Fixes are to use `std::u8string` and `std::u8string_view`, to cast through `reinterpret_cast<const char*>` where you must pass the bytes to a `char` API, or to drop the `u8` prefix and rely on an ordinary literal encoding of UTF-8. GCC has `-fno-char8_t` as an escape hatch while you migrate. Note that `char8_t` has no stream output at all, so UTF-8 text in iostreams still needs a `char` view.

> **Standardese.** [lex.ccon] says a character literal with a `u`, `U` or `u8` prefix must be encodable as a single code unit of its type, and in C++23 a literal that is not is ill-formed. [lex.string] gives each string prefix its element type and encoding, which is why `u8"..."` changed type in C++20 without any change to its bytes.

## Source, execution, and escapes

Three encodings are in play when you compile: the encoding of the source file, the ordinary literal encoding, and the encoding of the program's locale at run time. Before C++23 the standard talked about a basic source character set and an implementation-defined mapping to the execution set. C++23 reworked this around the translation character set, which is Unicode, and the ordinary and wide literal encodings. It also requires implementations to support UTF-8 source files.

Escapes let you avoid the question entirely for the source side. A universal-character-name, `\u` followed by four hex digits or `\U` followed by eight, names a code point whatever the source encoding is. C++23 added more forms.

```cpp
const char8_t* a = u8"α";                     // alpha, as a universal-character-name
const char8_t* b = u8"\N{GREEK SMALL LETTER ALPHA}"; // C++23: named escape
const char8_t* c = u8"\u{3b1}";                    // C++23: delimited escape
const char*    d = "\x{41}\o{102}";                // C++23: delimited hex and octal, "AB"
```

The delimited and named forms are useful because they have no length limit and the name documents the intent. The distinction between `\x41` and `A` matters: the first writes a raw code unit value, while the second names a code point and is encoded according to the literal's encoding.

## `<cctype>` and the negative char

The functions in `<cctype>`, such as `std::isalpha` and `std::toupper`, take an `int`. The argument must be representable as an `unsigned char` or equal `EOF`. Otherwise the behaviour is undefined. On a platform where `char` is signed, a byte such as 0xE9 becomes a negative `int`, so passing a plain `char` straight in is undefined.

```cpp
#include <cctype>

bool is_letter(char c) {
  return std::isalpha(static_cast<unsigned char>(c));  // the required cast
}
```

Even with the cast, `<cctype>` works one byte at a time in the current C locale. It cannot classify a multibyte UTF-8 character, and `std::toupper` cannot turn one code unit into two, so it cannot map `ß` to `SS`. For Unicode-aware classification and case mapping you need a library such as ICU.

> **Pitfall.** The cast to `unsigned char` fixes the undefined behaviour, not the model. `<cctype>` still classifies single bytes, so a UTF-8 text with accented letters gets misclassified even though no rule is broken.

## Code units, code points, grapheme clusters

The same text can have different lengths depending on what you count. The letter é can be one code point, U+00E9, or two: `e` followed by the combining acute accent U+0301. A reader sees one character either way.

```cpp
#include <string>

std::u8string s1 = u8"é";       // size() == 2 code units, 1 code point, 1 grapheme cluster
std::u8string s2 = u8"é";      // size() == 3 code units, 2 code points, 1 grapheme cluster
```

`size()` on any `basic_string` counts code units. Indexing, `find`, `substr` and comparisons are all by code unit too, so they can cut a multi-unit character in half, and `s1 == s2` is false even though they display the same. Normalization, collation and segmentation are not in the standard library.

The one place the library does look at graphemes is `std::format`. Its width and precision are measured in estimated terminal columns, not code units. For a string in a Unicode encoding, implementations should treat each extended grapheme cluster as 2 columns when it starts with a wide or fullwidth code point and 1 otherwise. The method is unspecified in general, so portable code should not depend on exact padding.

```cpp
#include <format>

// With a UTF-8 ordinary literal encoding, in libstdc++ 16:
auto w = std::format("{:>4}", "日");   // two spaces then the character: width 2
auto g = std::format("{:>4}", "é");  // three spaces: one grapheme cluster, width 1
```

Precision truncates a string to a prefix of whole clusters whose estimated width fits, so with that estimate a precision of 1 applied to a width-2 character yields an empty string.

## Conversions and `std::text_encoding`

`<codecvt>` and `std::wstring_convert` were the standard's UTF converters. Both were deprecated in C++17, and cppreference lists them as removed in C++26. Libstdc++ 16 still ships them, with deprecation warnings. The replacement in the standard is thinner: the C-style functions `mbrtoc8`, `mbrtoc16`, `mbrtoc32` and their inverses in `<cuchar>`, which convert between the locale's multibyte encoding and Unicode one code point at a time. For bulk conversion, write the loop yourself or use a library.

C++26 adds `std::text_encoding` in `<text_encoding>`, which is a C++26 feature. It does not convert anything. It identifies an encoding by its IANA registry number and name. `std::text_encoding::literal()` reports the ordinary literal encoding, and `std::text_encoding::environment()` reports the encoding the program's environment currently uses. The point is to let a program check before it assumes UTF-8.

```cpp
#include <text_encoding>

// C++26 only
static_assert(std::text_encoding::literal() == std::text_encoding::UTF8);
// Fails to compile if built with, for example, -fexec-charset=ISO-8859-1.
```

## What to remember

- A character type holds one code unit; text is a sequence of them in some encoding.
- `char`, `signed char` and `unsigned char` are three distinct types, and the signedness of `char` is implementation-defined.
- `wchar_t` has no portable encoding; `char8_t`, `char16_t` and `char32_t` are for UTF-8, UTF-16 and UTF-32.
- Since C++20, `u8` literals are `char8_t` arrays, which breaks conversion to `const char*` and stream output.
- A character literal must be encodable in one code unit; `u'\U0001F600'` is ill-formed.
- The ordinary literal encoding is chosen by the compiler, not by your source file; C++23 requires UTF-8 source support and adds named and delimited escapes.
- Pass `unsigned char` or `EOF` to `<cctype>` functions; a negative `char` is undefined.
- `size()` counts code units, so one displayed character can be one, two or more units, and canonically equal strings can compare unequal.
- `std::format` estimates width in columns, which is why precision can truncate to nothing.
- `<codecvt>` is deprecated and removed in C++26; `std::text_encoding` identifies encodings and is a C++26 feature.
