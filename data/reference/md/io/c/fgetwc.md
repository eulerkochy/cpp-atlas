# std::fgetwc

Source: https://en.cppreference.com/w/cpp/io/c/fgetwc

```cpp
// Defined in header <cwchar>
std::wint_t fgetwc( std::FILE* stream );
std::wint_t getwc( std::FILE* stream );
```

Reads the next wide character from the given input stream. `getwc()` may be implemented as a macro and may evaluate `stream` more than once.

## Parameters

- `stream` - to read the wide character from

## Return value

The next wide character from the stream or `WEOF` if an error has occurred or the end of file has been reached. If an encoding error occurred, `errno` is set to `EILSEQ`.

## See also

- [`fgetc`](https://en.cppreference.com/w/cpp/io/c/fgetc), [`getc`](https://en.cppreference.com/w/cpp/io/c/fgetc): gets a character from a file stream (function)
- [`fgetws`](https://en.cppreference.com/w/cpp/io/c/fgetws): gets a wide string from a file stream (function)
- [`fputwc`](https://en.cppreference.com/w/cpp/io/c/fputwc), [`putwc`](https://en.cppreference.com/w/cpp/io/c/fputwc): writes a wide character to a file stream (function)
- [`ungetwc`](https://en.cppreference.com/w/cpp/io/c/ungetwc): puts a wide character back into a file stream (function)
- [C documentation for `fgetwc`](https://en.cppreference.com/w/c/io/fgetwc)
