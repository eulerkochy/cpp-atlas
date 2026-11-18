# std::iswcntrl

Source: https://en.cppreference.com/w/cpp/string/wide/iswcntrl

```cpp
// Defined in header <cwctype>
int iswcntrl( std::wint_t ch );
```

Checks if the given wide character is a control character, i.e. codes `0x00-0x1F` and `0x7F` and any control characters specific to the current locale.

If the value of `ch` is neither representable as a `wchar_t` nor equal to the value of the macro `WEOF`, the behavior is undefined.

## Parameters

- `ch` - wide character

## Return value

Non-zero value if the wide character is a control character, zero otherwise.

## Notes

ISO 30112 defines POSIX control characters as Unicode characters U+0000..U+001F, U+007F..U+009F, U+2028, and U+2029 (Unicode classes Cc, Zl, and Zp).

## Example

```cpp
#include <clocale>
#include <cwctype>
#include <iostream>

int main()
{
    wchar_t c = L'\u2028'; // the Unicode character "line separator"

    std::cout << std::hex << std::showbase << std::boolalpha;
    std::cout << "in the default locale, iswcntrl(" << (std::wint_t)c << ") = "
              << (bool)std::iswcntrl(c) << '\n';
    std::setlocale(LC_ALL, "en_US.utf8");
    std::cout << "in Unicode locale, iswcntrl(" << (std::wint_t)c << ") = "
              << (bool)std::iswcntrl(c) << '\n';
}
```

Output:

```text
in the default locale, iswcntrl(0x2028) = false
in Unicode locale, iswcntrl(0x2028) = true
```

## See also

- [`iscntrl(std::locale)`](https://en.cppreference.com/w/cpp/locale/iscntrl): checks if a character is classified as a control character by a locale (function template)
- [`iscntrl`](https://en.cppreference.com/w/cpp/string/byte/iscntrl): checks if a character is a control character (function)
- [C documentation for `iswcntrl`](https://en.cppreference.com/w/c/string/wide/iswcntrl)

| ASCII values |   |   | characters | [`iscntrl`](https://en.cppreference.com/w/cpp/string/byte/iscntrl) `iswcntrl` | [`isprint`](https://en.cppreference.com/w/cpp/string/byte/isprint) [`iswprint`](https://en.cppreference.com/w/cpp/string/wide/iswprint) | [`isspace`](https://en.cppreference.com/w/cpp/string/byte/isspace) [`iswspace`](https://en.cppreference.com/w/cpp/string/wide/iswspace) | [`isblank`](https://en.cppreference.com/w/cpp/string/byte/isblank) [`iswblank`](https://en.cppreference.com/w/cpp/string/wide/iswblank) | [`isgraph`](https://en.cppreference.com/w/cpp/string/byte/isgraph) [`iswgraph`](https://en.cppreference.com/w/cpp/string/wide/iswgraph) | [`ispunct`](https://en.cppreference.com/w/cpp/string/byte/ispunct) [`iswpunct`](https://en.cppreference.com/w/cpp/string/wide/iswpunct) | [`isalnum`](https://en.cppreference.com/w/cpp/string/byte/isalnum) [`iswalnum`](https://en.cppreference.com/w/cpp/string/wide/iswalnum) | [`isalpha`](https://en.cppreference.com/w/cpp/string/byte/isalpha) [`iswalpha`](https://en.cppreference.com/w/cpp/string/wide/iswalpha) | [`isupper`](https://en.cppreference.com/w/cpp/string/byte/isupper) [`iswupper`](https://en.cppreference.com/w/cpp/string/wide/iswupper) | [`islower`](https://en.cppreference.com/w/cpp/string/byte/islower) [`iswlower`](https://en.cppreference.com/w/cpp/string/wide/iswlower) | [`isdigit`](https://en.cppreference.com/w/cpp/string/byte/isdigit) [`iswdigit`](https://en.cppreference.com/w/cpp/string/wide/iswdigit) | [`isxdigit`](https://en.cppreference.com/w/cpp/string/byte/isxdigit) [`iswxdigit`](https://en.cppreference.com/w/cpp/string/wide/iswxdigit) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| decimal | hexadecimal | octal | characters | [`iscntrl`](https://en.cppreference.com/w/cpp/string/byte/iscntrl) `iswcntrl` | [`isprint`](https://en.cppreference.com/w/cpp/string/byte/isprint) [`iswprint`](https://en.cppreference.com/w/cpp/string/wide/iswprint) | [`isspace`](https://en.cppreference.com/w/cpp/string/byte/isspace) [`iswspace`](https://en.cppreference.com/w/cpp/string/wide/iswspace) | [`isblank`](https://en.cppreference.com/w/cpp/string/byte/isblank) [`iswblank`](https://en.cppreference.com/w/cpp/string/wide/iswblank) | [`isgraph`](https://en.cppreference.com/w/cpp/string/byte/isgraph) [`iswgraph`](https://en.cppreference.com/w/cpp/string/wide/iswgraph) | [`ispunct`](https://en.cppreference.com/w/cpp/string/byte/ispunct) [`iswpunct`](https://en.cppreference.com/w/cpp/string/wide/iswpunct) | [`isalnum`](https://en.cppreference.com/w/cpp/string/byte/isalnum) [`iswalnum`](https://en.cppreference.com/w/cpp/string/wide/iswalnum) | [`isalpha`](https://en.cppreference.com/w/cpp/string/byte/isalpha) [`iswalpha`](https://en.cppreference.com/w/cpp/string/wide/iswalpha) | [`isupper`](https://en.cppreference.com/w/cpp/string/byte/isupper) [`iswupper`](https://en.cppreference.com/w/cpp/string/wide/iswupper) | [`islower`](https://en.cppreference.com/w/cpp/string/byte/islower) [`iswlower`](https://en.cppreference.com/w/cpp/string/wide/iswlower) | [`isdigit`](https://en.cppreference.com/w/cpp/string/byte/isdigit) [`iswdigit`](https://en.cppreference.com/w/cpp/string/wide/iswdigit) | [`isxdigit`](https://en.cppreference.com/w/cpp/string/byte/isxdigit) [`iswxdigit`](https://en.cppreference.com/w/cpp/string/wide/iswxdigit) |
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
