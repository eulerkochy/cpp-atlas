# std::isalnum

Source: https://en.cppreference.com/w/cpp/string/byte/isalnum

```cpp
// Defined in header <cctype>
int isalnum( int ch );
```

Checks if the given character is an alphanumeric character as classified by the current C locale. In the default locale, the following characters are alphanumeric:

- digits (`0123456789`)
- uppercase letters (`ABCDEFGHIJKLMNOPQRSTUVWXYZ`)
- lowercase letters (`abcdefghijklmnopqrstuvwxyz`)

The behavior is undefined if the value of `ch` is not representable as `unsigned char` and is not equal to `EOF`.

## Parameters

- `ch` - character to classify

## Return value

Non-zero value if the character is an alphanumeric character, `0` otherwise.

## Notes

Like all other functions from `<cctype>`, the behavior of `std::isalnum` is undefined if the argument's value is neither representable as `unsigned char` nor equal to `EOF`. To use these functions safely with plain `char`s (or `signed char`s), the argument should first be converted to `unsigned char`:

```cpp
bool my_isalnum(char ch)
{
    return std::isalnum(static_cast<unsigned char>(ch));
}
```

Similarly, they should not be directly used with standard algorithms when the iterator's value type is `char` or `signed char`. Instead, convert the value to `unsigned char` first:

```cpp
int count_alnums(const std::string& s)
{
    return std::count_if(s.begin(), s.end(),
                      // static_cast<int(*)(int)>(std::isalnum)         // wrong
                      // [](int c){ return std::isalnum(c); }           // wrong
                      // [](char c){ return std::isalnum(c); }          // wrong
                         [](unsigned char c){ return std::isalnum(c); } // correct
                        );
}
```

## Example

Demonstrates the use of `std::isalnum` with different locales (OS-specific).

```cpp
#include <cctype>
#include <clocale>
#include <iostream>

int main()
{
    unsigned char c = '\xdf'; // German letter ß in ISO-8859-1

    std::cout << "isalnum(\'\\xdf\', default C locale) returned "
              << std::boolalpha << static_cast<bool>(std::isalnum(c)) << '\n';

    if (std::setlocale(LC_ALL, "de_DE.iso88591"))
        std::cout << "isalnum(\'\\xdf\', ISO-8859-1 locale) returned "
                  << static_cast<bool>(std::isalnum(c)) << '\n';

}
```

Possible output:

```text
isalnum('\xdf', default C locale) returned false
isalnum('\xdf', ISO-8859-1 locale) returned true
```

## See also

- [`isalnum(std::locale)`](https://en.cppreference.com/w/cpp/locale/isalnum): checks if a character is classified as alphanumeric by a locale (function template)
- [`iswalnum`](https://en.cppreference.com/w/cpp/string/wide/iswalnum): checks if a wide character is alphanumeric (function)
- [C documentation for `isalnum`](https://en.cppreference.com/w/c/string/byte/isalnum)

| ASCII values |   |   | characters | [`iscntrl`](https://en.cppreference.com/w/cpp/string/byte/iscntrl) [`iswcntrl`](https://en.cppreference.com/w/cpp/string/wide/iswcntrl) | [`isprint`](https://en.cppreference.com/w/cpp/string/byte/isprint) [`iswprint`](https://en.cppreference.com/w/cpp/string/wide/iswprint) | [`isspace`](https://en.cppreference.com/w/cpp/string/byte/isspace) [`iswspace`](https://en.cppreference.com/w/cpp/string/wide/iswspace) | [`isblank`](https://en.cppreference.com/w/cpp/string/byte/isblank) [`iswblank`](https://en.cppreference.com/w/cpp/string/wide/iswblank) | [`isgraph`](https://en.cppreference.com/w/cpp/string/byte/isgraph) [`iswgraph`](https://en.cppreference.com/w/cpp/string/wide/iswgraph) | [`ispunct`](https://en.cppreference.com/w/cpp/string/byte/ispunct) [`iswpunct`](https://en.cppreference.com/w/cpp/string/wide/iswpunct) | `isalnum` [`iswalnum`](https://en.cppreference.com/w/cpp/string/wide/iswalnum) | [`isalpha`](https://en.cppreference.com/w/cpp/string/byte/isalpha) [`iswalpha`](https://en.cppreference.com/w/cpp/string/wide/iswalpha) | [`isupper`](https://en.cppreference.com/w/cpp/string/byte/isupper) [`iswupper`](https://en.cppreference.com/w/cpp/string/wide/iswupper) | [`islower`](https://en.cppreference.com/w/cpp/string/byte/islower) [`iswlower`](https://en.cppreference.com/w/cpp/string/wide/iswlower) | [`isdigit`](https://en.cppreference.com/w/cpp/string/byte/isdigit) [`iswdigit`](https://en.cppreference.com/w/cpp/string/wide/iswdigit) | [`isxdigit`](https://en.cppreference.com/w/cpp/string/byte/isxdigit) [`iswxdigit`](https://en.cppreference.com/w/cpp/string/wide/iswxdigit) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| decimal | hexadecimal | octal | characters | [`iscntrl`](https://en.cppreference.com/w/cpp/string/byte/iscntrl) [`iswcntrl`](https://en.cppreference.com/w/cpp/string/wide/iswcntrl) | [`isprint`](https://en.cppreference.com/w/cpp/string/byte/isprint) [`iswprint`](https://en.cppreference.com/w/cpp/string/wide/iswprint) | [`isspace`](https://en.cppreference.com/w/cpp/string/byte/isspace) [`iswspace`](https://en.cppreference.com/w/cpp/string/wide/iswspace) | [`isblank`](https://en.cppreference.com/w/cpp/string/byte/isblank) [`iswblank`](https://en.cppreference.com/w/cpp/string/wide/iswblank) | [`isgraph`](https://en.cppreference.com/w/cpp/string/byte/isgraph) [`iswgraph`](https://en.cppreference.com/w/cpp/string/wide/iswgraph) | [`ispunct`](https://en.cppreference.com/w/cpp/string/byte/ispunct) [`iswpunct`](https://en.cppreference.com/w/cpp/string/wide/iswpunct) | `isalnum` [`iswalnum`](https://en.cppreference.com/w/cpp/string/wide/iswalnum) | [`isalpha`](https://en.cppreference.com/w/cpp/string/byte/isalpha) [`iswalpha`](https://en.cppreference.com/w/cpp/string/wide/iswalpha) | [`isupper`](https://en.cppreference.com/w/cpp/string/byte/isupper) [`iswupper`](https://en.cppreference.com/w/cpp/string/wide/iswupper) | [`islower`](https://en.cppreference.com/w/cpp/string/byte/islower) [`iswlower`](https://en.cppreference.com/w/cpp/string/wide/iswlower) | [`isdigit`](https://en.cppreference.com/w/cpp/string/byte/isdigit) [`iswdigit`](https://en.cppreference.com/w/cpp/string/wide/iswdigit) | [`isxdigit`](https://en.cppreference.com/w/cpp/string/byte/isxdigit) [`iswxdigit`](https://en.cppreference.com/w/cpp/string/wide/iswxdigit) |
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
