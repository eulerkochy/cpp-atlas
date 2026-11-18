# std::isblank

Source: https://en.cppreference.com/w/cpp/string/byte/isblank

```cpp
// Defined in header <cctype>
int isblank( int ch ); // (since C++11)
```

Checks if the given character is a blank character as classified by the currently installed C locale. Blank characters are whitespace characters used to separate words within a sentence. In the default C locale, only space (`0x20`) and horizontal tab (`0x09`) are classified as blank characters.

The behavior is undefined if the value of `ch` is not representable as `unsigned char` and is not equal to `EOF`.

## Parameters

- `ch` - character to classify

## Return value

Non-zero value if the character is a blank character, zero otherwise.

## Notes

Like all other functions from `<cctype>`, the behavior of `std::isblank` is undefined if the argument's value is neither representable as `unsigned char` nor equal to `EOF`. To use these functions safely with plain `char`s (or `signed char`s), the argument should first be converted to `unsigned char`:

```cpp
bool my_isblank(char ch)
{
    return std::isblank(static_cast<unsigned char>(ch));
}
```

Similarly, they should not be directly used with standard algorithms when the iterator's value type is `char` or `signed char`. Instead, convert the value to `unsigned char` first:

```cpp
int count_blanks(const std::string& s)
{
    return std::count_if(s.begin(), s.end(),
                      // static_cast<int(*)(int)>(std::isblank)         // wrong
                      // [](int c){ return std::isblank(c); }           // wrong
                      // [](char c){ return std::isblank(c); }          // wrong
                         [](unsigned char c){ return std::isblank(c); } // correct
                        );
}
```

## See also

- [`isblank(std::locale)`](https://en.cppreference.com/w/cpp/locale/isblank) (C++11): checks if a character is classified as a blank character by a locale (function template)
- [`iswblank`](https://en.cppreference.com/w/cpp/string/wide/iswblank) (C++11): checks if a wide character is a blank character (function)
- [C documentation for `isblank`](https://en.cppreference.com/w/c/string/byte/isblank)

| ASCII values |   |   | characters | [`iscntrl`](https://en.cppreference.com/w/cpp/string/byte/iscntrl) [`iswcntrl`](https://en.cppreference.com/w/cpp/string/wide/iswcntrl) | [`isprint`](https://en.cppreference.com/w/cpp/string/byte/isprint) [`iswprint`](https://en.cppreference.com/w/cpp/string/wide/iswprint) | [`isspace`](https://en.cppreference.com/w/cpp/string/byte/isspace) [`iswspace`](https://en.cppreference.com/w/cpp/string/wide/iswspace) | `isblank` [`iswblank`](https://en.cppreference.com/w/cpp/string/wide/iswblank) | [`isgraph`](https://en.cppreference.com/w/cpp/string/byte/isgraph) [`iswgraph`](https://en.cppreference.com/w/cpp/string/wide/iswgraph) | [`ispunct`](https://en.cppreference.com/w/cpp/string/byte/ispunct) [`iswpunct`](https://en.cppreference.com/w/cpp/string/wide/iswpunct) | [`isalnum`](https://en.cppreference.com/w/cpp/string/byte/isalnum) [`iswalnum`](https://en.cppreference.com/w/cpp/string/wide/iswalnum) | [`isalpha`](https://en.cppreference.com/w/cpp/string/byte/isalpha) [`iswalpha`](https://en.cppreference.com/w/cpp/string/wide/iswalpha) | [`isupper`](https://en.cppreference.com/w/cpp/string/byte/isupper) [`iswupper`](https://en.cppreference.com/w/cpp/string/wide/iswupper) | [`islower`](https://en.cppreference.com/w/cpp/string/byte/islower) [`iswlower`](https://en.cppreference.com/w/cpp/string/wide/iswlower) | [`isdigit`](https://en.cppreference.com/w/cpp/string/byte/isdigit) [`iswdigit`](https://en.cppreference.com/w/cpp/string/wide/iswdigit) | [`isxdigit`](https://en.cppreference.com/w/cpp/string/byte/isxdigit) [`iswxdigit`](https://en.cppreference.com/w/cpp/string/wide/iswxdigit) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| decimal | hexadecimal | octal | characters | [`iscntrl`](https://en.cppreference.com/w/cpp/string/byte/iscntrl) [`iswcntrl`](https://en.cppreference.com/w/cpp/string/wide/iswcntrl) | [`isprint`](https://en.cppreference.com/w/cpp/string/byte/isprint) [`iswprint`](https://en.cppreference.com/w/cpp/string/wide/iswprint) | [`isspace`](https://en.cppreference.com/w/cpp/string/byte/isspace) [`iswspace`](https://en.cppreference.com/w/cpp/string/wide/iswspace) | `isblank` [`iswblank`](https://en.cppreference.com/w/cpp/string/wide/iswblank) | [`isgraph`](https://en.cppreference.com/w/cpp/string/byte/isgraph) [`iswgraph`](https://en.cppreference.com/w/cpp/string/wide/iswgraph) | [`ispunct`](https://en.cppreference.com/w/cpp/string/byte/ispunct) [`iswpunct`](https://en.cppreference.com/w/cpp/string/wide/iswpunct) | [`isalnum`](https://en.cppreference.com/w/cpp/string/byte/isalnum) [`iswalnum`](https://en.cppreference.com/w/cpp/string/wide/iswalnum) | [`isalpha`](https://en.cppreference.com/w/cpp/string/byte/isalpha) [`iswalpha`](https://en.cppreference.com/w/cpp/string/wide/iswalpha) | [`isupper`](https://en.cppreference.com/w/cpp/string/byte/isupper) [`iswupper`](https://en.cppreference.com/w/cpp/string/wide/iswupper) | [`islower`](https://en.cppreference.com/w/cpp/string/byte/islower) [`iswlower`](https://en.cppreference.com/w/cpp/string/wide/iswlower) | [`isdigit`](https://en.cppreference.com/w/cpp/string/byte/isdigit) [`iswdigit`](https://en.cppreference.com/w/cpp/string/wide/iswdigit) | [`isxdigit`](https://en.cppreference.com/w/cpp/string/byte/isxdigit) [`iswxdigit`](https://en.cppreference.com/w/cpp/string/wide/iswxdigit) |
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
