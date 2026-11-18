# fgetws

Source: https://en.cppreference.com/w/c/io/fgetws

```cpp
// Defined in header <wchar.h>
wchar_t* fgetws( wchar_t* str, int count, FILE* stream ); // (since C95) (until C99)
wchar_t* fgetws( wchar_t* restrict str, int count, FILE* restrict stream ); // (since C99)
```

Reads at most `count - 1` wide characters from the given file stream and stores them in `str`. The produced wide string is always null-terminated. Parsing stops if end-of-file occurs or a newline wide character is found, in which case `str` will contain that wide newline character.

## Parameters

- `str` - wide string to read the characters to
- `count` - the length of `str`
- `stream` - file stream to read the data from

## Return value

`str` on success, a null pointer on an error

## Example

> Note: This section is incomplete Reason: no example

## References

- C23 standard (ISO/IEC 9899:2024):

  - 7.29.3.2 The fgetws function (p: TBD)

- C17 standard (ISO/IEC 9899:2018):

  - 7.29.3.2 The fgetws function (p: TBD)

- C11 standard (ISO/IEC 9899:2011):

  - 7.29.3.2 The fgetws function (p: 422)

- C99 standard (ISO/IEC 9899:1999):

  - 7.24.3.2 The fgetws function (p: 367-368)

## See also

- [`wscanf`](https://en.cppreference.com/w/c/io/fwscanf) (C95), [`fwscanf`](https://en.cppreference.com/w/c/io/fwscanf) (C95), [`swscanf`](https://en.cppreference.com/w/c/io/fwscanf) (C95), [`wscanf_s`](https://en.cppreference.com/w/c/io/fwscanf) (C11), [`fwscanf_s`](https://en.cppreference.com/w/c/io/fwscanf) (C11), [`swscanf_s`](https://en.cppreference.com/w/c/io/fwscanf) (C11): reads formatted wide character input from `stdin`, a file stream or a buffer (function)
- [`fgetwc`](https://en.cppreference.com/w/c/io/fgetwc) (C95), [`getwc`](https://en.cppreference.com/w/c/io/fgetwc): gets a wide character from a file stream (function)
- [`fputws`](https://en.cppreference.com/w/c/io/fputws) (C95): writes a wide string to a file stream (function)
- [`getline`](https://en.cppreference.com/w/c/experimental/dynamic/getline) (dynamic memory TR), [`getwline`](https://en.cppreference.com/w/c/experimental/dynamic/getline), [`getdelim`](https://en.cppreference.com/w/c/experimental/dynamic/getline), [`getwdelim`](https://en.cppreference.com/w/c/experimental/dynamic/getline): read from a stream into an automatically resized buffer until delimiter/end of line (function)
- [C++ documentation for `fgetws`](https://en.cppreference.com/w/cpp/io/c/fgetws)
