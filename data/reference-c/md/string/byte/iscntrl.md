# iscntrl

Source: https://en.cppreference.com/w/c/string/byte/iscntrl

```cpp
// Defined in header <ctype.h>
int iscntrl( int ch );
```

Checks if the given character is a control character, i.e. codes `0x00-0x1F` and `0x7F`.

The behavior is undefined if the value of `ch` is not representable as `unsigned char` and is not equal to `EOF`.

## Parameters

- `ch` - character to classify

## Return value

Non-zero value if the character is a control character, zero otherwise.

## Example

```c
#include <stdio.h>
#include <ctype.h>
#include <locale.h>

int main(void)
{
    unsigned char c = '\x94'; // the control code CCH in ISO-8859-1
    printf("In the default C locale, \\x94 is %sa control character\n",
           iscntrl(c) ? "" : "not " );
    setlocale(LC_ALL, "en_GB.iso88591");
    printf("In ISO-8859-1 locale, \\x94 is %sa control character\n",
           iscntrl(c) ? "" : "not " );
}
```

Possible output:

```text
In the default C locale, \x94 is not a control character
In ISO-8859-1 locale, \x94 is a control character
```

## References

- C17 standard (ISO/IEC 9899:2018):

  - 7.4.1.4 The iscntrl function (p: 146)

- C11 standard (ISO/IEC 9899:2011):

  - 7.4.1.4 The iscntrl function (p: 201)

- C99 standard (ISO/IEC 9899:1999):

  - 7.4.1.4 The iscntrl function (p: 182)

- C89/C90 standard (ISO/IEC 9899:1990):

  - 4.3.1.3 The iscntrl function

## See also

- [`iswcntrl`](https://en.cppreference.com/w/c/string/wide/iswcntrl) (C95): checks if a wide character is a control character (function)
- [C++ documentation for `iscntrl`](https://en.cppreference.com/w/cpp/string/byte/iscntrl)

| ASCII values |   |   | characters | `iscntrl` [`iswcntrl`](https://en.cppreference.com/w/c/string/wide/iswcntrl) | [`isprint`](https://en.cppreference.com/w/c/string/byte/isprint) [`iswprint`](https://en.cppreference.com/w/c/string/wide/iswprint) | [`isspace`](https://en.cppreference.com/w/c/string/byte/isspace) [`iswspace`](https://en.cppreference.com/w/c/string/wide/iswspace) | [`isblank`](https://en.cppreference.com/w/c/string/byte/isblank) [`iswblank`](https://en.cppreference.com/w/c/string/wide/iswblank) | [`isgraph`](https://en.cppreference.com/w/c/string/byte/isgraph) [`iswgraph`](https://en.cppreference.com/w/c/string/wide/iswgraph) | [`ispunct`](https://en.cppreference.com/w/c/string/byte/ispunct) [`iswpunct`](https://en.cppreference.com/w/c/string/wide/iswpunct) | [`isalnum`](https://en.cppreference.com/w/c/string/byte/isalnum) [`iswalnum`](https://en.cppreference.com/w/c/string/wide/iswalnum) | [`isalpha`](https://en.cppreference.com/w/c/string/byte/isalpha) [`iswalpha`](https://en.cppreference.com/w/c/string/wide/iswalpha) | [`isupper`](https://en.cppreference.com/w/c/string/byte/isupper) [`iswupper`](https://en.cppreference.com/w/c/string/wide/iswupper) | [`islower`](https://en.cppreference.com/w/c/string/byte/islower) [`iswlower`](https://en.cppreference.com/w/c/string/wide/iswlower) | [`isdigit`](https://en.cppreference.com/w/c/string/byte/isdigit) [`iswdigit`](https://en.cppreference.com/w/c/string/wide/iswdigit) | [`isxdigit`](https://en.cppreference.com/w/c/string/byte/isxdigit) [`iswxdigit`](https://en.cppreference.com/w/c/string/wide/iswxdigit) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| decimal | hexadecimal | octal | characters | `iscntrl` [`iswcntrl`](https://en.cppreference.com/w/c/string/wide/iswcntrl) | [`isprint`](https://en.cppreference.com/w/c/string/byte/isprint) [`iswprint`](https://en.cppreference.com/w/c/string/wide/iswprint) | [`isspace`](https://en.cppreference.com/w/c/string/byte/isspace) [`iswspace`](https://en.cppreference.com/w/c/string/wide/iswspace) | [`isblank`](https://en.cppreference.com/w/c/string/byte/isblank) [`iswblank`](https://en.cppreference.com/w/c/string/wide/iswblank) | [`isgraph`](https://en.cppreference.com/w/c/string/byte/isgraph) [`iswgraph`](https://en.cppreference.com/w/c/string/wide/iswgraph) | [`ispunct`](https://en.cppreference.com/w/c/string/byte/ispunct) [`iswpunct`](https://en.cppreference.com/w/c/string/wide/iswpunct) | [`isalnum`](https://en.cppreference.com/w/c/string/byte/isalnum) [`iswalnum`](https://en.cppreference.com/w/c/string/wide/iswalnum) | [`isalpha`](https://en.cppreference.com/w/c/string/byte/isalpha) [`iswalpha`](https://en.cppreference.com/w/c/string/wide/iswalpha) | [`isupper`](https://en.cppreference.com/w/c/string/byte/isupper) [`iswupper`](https://en.cppreference.com/w/c/string/wide/iswupper) | [`islower`](https://en.cppreference.com/w/c/string/byte/islower) [`iswlower`](https://en.cppreference.com/w/c/string/wide/iswlower) | [`isdigit`](https://en.cppreference.com/w/c/string/byte/isdigit) [`iswdigit`](https://en.cppreference.com/w/c/string/wide/iswdigit) | [`isxdigit`](https://en.cppreference.com/w/c/string/byte/isxdigit) [`iswxdigit`](https://en.cppreference.com/w/c/string/wide/iswxdigit) |
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
