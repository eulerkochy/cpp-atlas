# getwchar

Source: https://en.cppreference.com/w/c/io/getwchar

```cpp
// Defined in header <wchar.h>
wint_t getwchar(void); // (since C95)
```

Reads the next wide character from `stdin`.

## Parameters

(none)

## Return value

the obtained wide character or `WEOF` if an error has occurred or the end of file reached

## References

- C11 standard (ISO/IEC 9899:2011):

  - 7.29.3.7 The getwchar function (p: 424)

- C99 standard (ISO/IEC 9899:1999):

  - 7.24.3.7 The getwchar function (p: 369-370)

## See also

- [`getchar`](https://en.cppreference.com/w/c/io/getchar): reads a character from `stdin` (function)
- [`fgetwc`](https://en.cppreference.com/w/c/io/fgetwc) (C95), [`getwc`](https://en.cppreference.com/w/c/io/fgetwc): gets a wide character from a file stream (function)
- [C++ documentation for `getwchar`](https://en.cppreference.com/w/cpp/io/c/getwchar)
