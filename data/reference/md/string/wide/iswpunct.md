# std::iswpunct

Source: https://en.cppreference.com/w/cpp/string/wide/iswpunct

```cpp
// Defined in header <cwctype>
int iswpunct( std::wint_t ch );
```

Checks if the given wide character is a punctuation character, i.e. it is one of `` !"#$%&'()*+,-./:;<=>?@[\]^_`{|}~ `` or any punctuation character specific to the current locale.

If the value of `ch` is neither representable as a `wchar_t` nor equal to the value of the macro `WEOF`, the behavior is undefined.

## Parameters

- `ch` - wide character

## Return value

Non-zero value if the wide character is a punctuation character, zero otherwise.

## Notes

ISO 30112 specifies which Unicode characters are include in POSIX punct category.

## Example

```cpp
#include <clocale>
#include <cwctype>
#include <iostream>

int main()
{
    wchar_t c = L'\u2051'; // Two asterisks ('⁑')

    std::cout << std::hex << std::showbase << std::boolalpha
              << "in the default locale, iswpunct("
              << static_cast<std::wint_t>(c) << ") = "
              << static_cast<bool>(std::iswpunct(c)) << '\n';

    std::setlocale(LC_ALL, "en_US.utf8");
    std::cout << "in Unicode locale, iswpunct("
              << static_cast<std::wint_t>(c) << ") = "
              << static_cast<bool>(std::iswpunct(c)) << '\n';
}
```

Output:

```text
in the default locale, iswpunct(0x2051) = false
in Unicode locale, iswpunct(0x2051) = true
```

## See also

- [`ispunct(std::locale)`](https://en.cppreference.com/w/cpp/locale/ispunct): checks if a character is classified as punctuation by a locale (function template)
- [`ispunct`](https://en.cppreference.com/w/cpp/string/byte/ispunct): checks if a character is a punctuation character (function)
- [C documentation for `iswpunct`](https://en.cppreference.com/w/c/string/wide/iswpunct)

| ASCII values |   |   | characters | [`iscntrl`](https://en.cppreference.com/w/cpp/string/byte/iscntrl) [`iswcntrl`](https://en.cppreference.com/w/cpp/string/wide/iswcntrl) | [`isprint`](https://en.cppreference.com/w/cpp/string/byte/isprint) [`iswprint`](https://en.cppreference.com/w/cpp/string/wide/iswprint) | [`isspace`](https://en.cppreference.com/w/cpp/string/byte/isspace) [`iswspace`](https://en.cppreference.com/w/cpp/string/wide/iswspace) | [`isblank`](https://en.cppreference.com/w/cpp/string/byte/isblank) [`iswblank`](https://en.cppreference.com/w/cpp/string/wide/iswblank) | [`isgraph`](https://en.cppreference.com/w/cpp/string/byte/isgraph) [`iswgraph`](https://en.cppreference.com/w/cpp/string/wide/iswgraph) | [`ispunct`](https://en.cppreference.com/w/cpp/string/byte/ispunct) `iswpunct` | [`isalnum`](https://en.cppreference.com/w/cpp/string/byte/isalnum) [`iswalnum`](https://en.cppreference.com/w/cpp/string/wide/iswalnum) | [`isalpha`](https://en.cppreference.com/w/cpp/string/byte/isalpha) [`iswalpha`](https://en.cppreference.com/w/cpp/string/wide/iswalpha) | [`isupper`](https://en.cppreference.com/w/cpp/string/byte/isupper) [`iswupper`](https://en.cppreference.com/w/cpp/string/wide/iswupper) | [`islower`](https://en.cppreference.com/w/cpp/string/byte/islower) [`iswlower`](https://en.cppreference.com/w/cpp/string/wide/iswlower) | [`isdigit`](https://en.cppreference.com/w/cpp/string/byte/isdigit) [`iswdigit`](https://en.cppreference.com/w/cpp/string/wide/iswdigit) | [`isxdigit`](https://en.cppreference.com/w/cpp/string/byte/isxdigit) [`iswxdigit`](https://en.cppreference.com/w/cpp/string/wide/iswxdigit) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| decimal | hexadecimal | octal | characters | [`iscntrl`](https://en.cppreference.com/w/cpp/string/byte/iscntrl) [`iswcntrl`](https://en.cppreference.com/w/cpp/string/wide/iswcntrl) | [`isprint`](https://en.cppreference.com/w/cpp/string/byte/isprint) [`iswprint`](https://en.cppreference.com/w/cpp/string/wide/iswprint) | [`isspace`](https://en.cppreference.com/w/cpp/string/byte/isspace) [`iswspace`](https://en.cppreference.com/w/cpp/string/wide/iswspace) | [`isblank`](https://en.cppreference.com/w/cpp/string/byte/isblank) [`iswblank`](https://en.cppreference.com/w/cpp/string/wide/iswblank) | [`isgraph`](https://en.cppreference.com/w/cpp/string/byte/isgraph) [`iswgraph`](https://en.cppreference.com/w/cpp/string/wide/iswgraph) | [`ispunct`](https://en.cppreference.com/w/cpp/string/byte/ispunct) `iswpunct` | [`isalnum`](https://en.cppreference.com/w/cpp/string/byte/isalnum) [`iswalnum`](https://en.cppreference.com/w/cpp/string/wide/iswalnum) | [`isalpha`](https://en.cppreference.com/w/cpp/string/byte/isalpha) [`iswalpha`](https://en.cppreference.com/w/cpp/string/wide/iswalpha) | [`isupper`](https://en.cppreference.com/w/cpp/string/byte/isupper) [`iswupper`](https://en.cppreference.com/w/cpp/string/wide/iswupper) | [`islower`](https://en.cppreference.com/w/cpp/string/byte/islower) [`iswlower`](https://en.cppreference.com/w/cpp/string/wide/iswlower) | [`isdigit`](https://en.cppreference.com/w/cpp/string/byte/isdigit) [`iswdigit`](https://en.cppreference.com/w/cpp/string/wide/iswdigit) | [`isxdigit`](https://en.cppreference.com/w/cpp/string/byte/isxdigit) [`iswxdigit`](https://en.cppreference.com/w/cpp/string/wide/iswxdigit) |
| 0–8 | `\x0`–`\x8` | `\0`–`\10` | control codes (`NUL`, etc.) | `≠0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` |
| 9 | `\x9` | `\11` | tab (`\t`) | `≠0` | `0` | `≠0` | `≠0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` |
| 10–13 | `\xA`–`\xD` | `\12`–`\15` | whitespaces (`\n`, `\v`, `\f`, `\r`) | `≠0` | `0` | `≠0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` |
| 14–31 | `\xE`–`\x1F` | `\16`–`\37` | control codes | `≠0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` |
| 32 | `\x20` | `\40` | space | `0` | `≠0` | `≠0` | `≠0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` |
| 33–47 | `\x21`–`\x2F` | `\41`–`\57` | `!"#$%&'()*+,-./` | `0` | `≠0` | `0` | `0` | `≠0` | `≠0` | `0` | `0` | `0` | `0` | `0` | `0` |
| 48–57 | `\x30`–`\x39` | `\60`–`\71` | `0123456789` | `0` | `≠0` | `0` | `0` | `≠0` | `0` | `≠0` | `0` | `0` | `0` | `≠0` | `≠0` |
| 58–64 | `\x3A`–`\x40` | `\72`–`\100` | `:;<=>?@` | `0` | `≠0` | `0` | `0` | `≠0` | `≠0` | `0` | `0` | `0` | `0` | `0` | `0` |
| 65–70 | `\x41`–`\x46` | `\101`–`\106` | `ABCDEF` | `0` | `≠0` | `0` | `0` | `≠0` | `0` | `≠0` | `≠0` | `≠0` | `0` | `0` | `≠0` |
| 71–90 | `\x47`–`\x5A` | `\107`–`\132` | `GHIJKLMNOP` `QRSTUVWXYZ` | `0` | `≠0` | `0` | `0` | `≠0` | `0` | `≠0` | `≠0` | `≠0` | `0` | `0` | `0` |
| 91–96 | `\x5B`–`\x60` | `\133`–`\140` | `` [\]^_` `` | `0` | `≠0` | `0` | `0` | `≠0` | `≠0` | `0` | `0` | `0` | `0` | `0` | `0` |
| 97–102 | `\x61`–`\x66` | `\141`–`\146` | `abcdef` | `0` | `≠0` | `0` | `0` | `≠0` | `0` | `≠0` | `≠0` | `0` | `≠0` | `0` | `≠0` |
| 103–122 | `\x67`–`\x7A` | `\147`–`\172` | `ghijklmnop` `qrstuvwxyz` | `0` | `≠0` | `0` | `0` | `≠0` | `0` | `≠0` | `≠0` | `0` | `≠0` | `0` | `0` |
| 123–126 | `\x7B`–`\x7E` | `\172`–`\176` | `{\|}~` | `0` | `≠0` | `0` | `0` | `≠0` | `≠0` | `0` | `0` | `0` | `0` | `0` | `0` |
| 127 | `\x7F` | `\177` | backspace character (`DEL`) | `≠0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` |
