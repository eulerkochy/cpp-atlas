# std::getwchar

Source: https://en.cppreference.com/w/cpp/io/c/getwchar

```cpp
// Defined in header <cwchar>
std::wint_t getwchar();
```

Reads the next wide character from `stdin`.

## Parameters

(none)

## Return value

The obtained wide character, or `WEOF` if an error has occurred or the end of file reached

## See also

- [`getchar`](https://en.cppreference.com/w/cpp/io/c/getchar): reads a character from `stdin` (function)
- [`fgetwc`](https://en.cppreference.com/w/cpp/io/c/fgetwc), [`getwc`](https://en.cppreference.com/w/cpp/io/c/fgetwc): gets a wide character from a file stream (function)
- [C documentation for `getwchar`](https://en.cppreference.com/w/c/io/getwchar)
