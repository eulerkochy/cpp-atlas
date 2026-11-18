# std::ferror

Source: https://en.cppreference.com/w/cpp/io/c/ferror

```cpp
// Defined in header <cstdio>
int ferror( std::FILE* stream );
```

Checks the given stream for errors.

## Parameters

- `stream` - the file stream to check

## Return value

Nonzero value if the file stream has errors occurred, `​0​` otherwise.

## Example

```cpp
#include <clocale>
#include <cstdio>
#include <cstdlib>
#include <cwchar>

int main()
{
    const char *fname = std::tmpnam(nullptr);
    std::FILE* f = std::fopen(fname, "wb");
    std::fputs("\xff\xff\n", f); // not a valid UTF-8 character sequence
    std::fclose(f);

    std::setlocale(LC_ALL, "en_US.utf8");
    f = std::fopen(fname, "rb");
    std::wint_t ch;
    while ((ch=std::fgetwc(f)) != WEOF) // attempt to read as UTF-8
        std::printf("%#x ", ch);

    if (std::feof(f))
        puts("EOF indicator set");
    if (std::ferror(f))
        puts("Error indicator set");
}
```

Output:

```text
Error indicator set
```

## See also

- [`clearerr`](https://en.cppreference.com/w/cpp/io/c/clearerr): clears errors (function)
- [`feof`](https://en.cppreference.com/w/cpp/io/c/feof): checks for the end-of-file (function)
- [`fail`](https://en.cppreference.com/w/cpp/io/basic_ios/fail): checks if an error has occurred (public member function of `std::basic_ios<CharT,Traits>`)
- [C documentation for `ferror`](https://en.cppreference.com/w/c/io/ferror)
