# isalnum

Source: https://en.cppreference.com/w/c/string/byte/isalnum

```cpp
// Defined in header <ctype.h>
int isalnum( int ch );
```

Checks if the given character is an alphanumeric character as classified by the current C locale. In the default locale, the following characters are alphanumeric:

- Digits (`0123456789`),
- Uppercase letters (`ABCDEFGHIJKLMNOPQRSTUVWXYZ`),
- Lowercase letters (`abcdefghijklmnopqrstuvwxyz`).

The behavior is undefined if the value of `ch` is not representable as `unsigned char` and is not equal to `EOF`.

## Parameters

- `ch` - character to classify

## Return value

Non-zero value if the character is an alphanumeric character, `​0​` otherwise.

## Example

Demonstrates the use of `isalnum` with different locales (OS-specific).

```c
#include <ctype.h>
#include <locale.h>
#include <stdio.h>

int main(void)
{
    unsigned char c = '\xdf'; // German letter ß in ISO-8859-1

    printf("isalnum('\\xdf') in default C locale returned %d\n", !!isalnum(c));

    if (setlocale(LC_CTYPE, "de_DE.iso88591"))
        printf("isalnum('\\xdf') in ISO-8859-1 locale returned %d\n", !!isalnum(c));
}
```

Possible output:

```text
isalnum('\xdf') in default C locale returned 0
isalnum('\xdf') in ISO-8859-1 locale returned 1
```

## References

- C23 standard (ISO/IEC 9899:2024):

  - 7.4.1.1 The isalnum function (p: TBD)

- C17 standard (ISO/IEC 9899:2018):

  - 7.4.1.1 The isalnum function (p: 145)

- C11 standard (ISO/IEC 9899:2011):

  - 7.4.1.1 The isalnum function (p: 200)

- C99 standard (ISO/IEC 9899:1999):

  - 7.4.1.1 The isalnum function (p: 181)

- C89/C90 standard (ISO/IEC 9899:1990):

  - 4.3.1.1 The isalnum function

## See also

- [`iswalnum`](https://en.cppreference.com/w/c/string/wide/iswalnum) (C95): checks if a wide character is alphanumeric (function)
- [C++ documentation for `isalnum`](https://en.cppreference.com/w/cpp/string/byte/isalnum)

| ASCII values |   |   | characters | [`iscntrl`](https://en.cppreference.com/w/c/string/byte/iscntrl) [`iswcntrl`](https://en.cppreference.com/w/c/string/wide/iswcntrl) | [`isprint`](https://en.cppreference.com/w/c/string/byte/isprint) [`iswprint`](https://en.cppreference.com/w/c/string/wide/iswprint) | [`isspace`](https://en.cppreference.com/w/c/string/byte/isspace) [`iswspace`](https://en.cppreference.com/w/c/string/wide/iswspace) | [`isblank`](https://en.cppreference.com/w/c/string/byte/isblank) [`iswblank`](https://en.cppreference.com/w/c/string/wide/iswblank) | [`isgraph`](https://en.cppreference.com/w/c/string/byte/isgraph) [`iswgraph`](https://en.cppreference.com/w/c/string/wide/iswgraph) | [`ispunct`](https://en.cppreference.com/w/c/string/byte/ispunct) [`iswpunct`](https://en.cppreference.com/w/c/string/wide/iswpunct) | `isalnum` [`iswalnum`](https://en.cppreference.com/w/c/string/wide/iswalnum) | [`isalpha`](https://en.cppreference.com/w/c/string/byte/isalpha) [`iswalpha`](https://en.cppreference.com/w/c/string/wide/iswalpha) | [`isupper`](https://en.cppreference.com/w/c/string/byte/isupper) [`iswupper`](https://en.cppreference.com/w/c/string/wide/iswupper) | [`islower`](https://en.cppreference.com/w/c/string/byte/islower) [`iswlower`](https://en.cppreference.com/w/c/string/wide/iswlower) | [`isdigit`](https://en.cppreference.com/w/c/string/byte/isdigit) [`iswdigit`](https://en.cppreference.com/w/c/string/wide/iswdigit) | [`isxdigit`](https://en.cppreference.com/w/c/string/byte/isxdigit) [`iswxdigit`](https://en.cppreference.com/w/c/string/wide/iswxdigit) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| decimal | hexadecimal | octal | characters | [`iscntrl`](https://en.cppreference.com/w/c/string/byte/iscntrl) [`iswcntrl`](https://en.cppreference.com/w/c/string/wide/iswcntrl) | [`isprint`](https://en.cppreference.com/w/c/string/byte/isprint) [`iswprint`](https://en.cppreference.com/w/c/string/wide/iswprint) | [`isspace`](https://en.cppreference.com/w/c/string/byte/isspace) [`iswspace`](https://en.cppreference.com/w/c/string/wide/iswspace) | [`isblank`](https://en.cppreference.com/w/c/string/byte/isblank) [`iswblank`](https://en.cppreference.com/w/c/string/wide/iswblank) | [`isgraph`](https://en.cppreference.com/w/c/string/byte/isgraph) [`iswgraph`](https://en.cppreference.com/w/c/string/wide/iswgraph) | [`ispunct`](https://en.cppreference.com/w/c/string/byte/ispunct) [`iswpunct`](https://en.cppreference.com/w/c/string/wide/iswpunct) | `isalnum` [`iswalnum`](https://en.cppreference.com/w/c/string/wide/iswalnum) | [`isalpha`](https://en.cppreference.com/w/c/string/byte/isalpha) [`iswalpha`](https://en.cppreference.com/w/c/string/wide/iswalpha) | [`isupper`](https://en.cppreference.com/w/c/string/byte/isupper) [`iswupper`](https://en.cppreference.com/w/c/string/wide/iswupper) | [`islower`](https://en.cppreference.com/w/c/string/byte/islower) [`iswlower`](https://en.cppreference.com/w/c/string/wide/iswlower) | [`isdigit`](https://en.cppreference.com/w/c/string/byte/isdigit) [`iswdigit`](https://en.cppreference.com/w/c/string/wide/iswdigit) | [`isxdigit`](https://en.cppreference.com/w/c/string/byte/isxdigit) [`iswxdigit`](https://en.cppreference.com/w/c/string/wide/iswxdigit) |
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
| 123–126 | `\x7B`–`\x7E` | `\173`–`\176` | `{\|}~` | `0` | `≠0` | `0` | `0` | `≠0` | `≠0` | `0` | `0` | `0` | `0` | `0` | `0` |
| 127 | `\x7F` | `\177` | backspace character (`DEL`) | `≠0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` | `0` |
