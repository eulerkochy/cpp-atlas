# std::streamsize

Source: https://en.cppreference.com/w/cpp/io/streamsize

```cpp
// Defined in header <ios>
typedef /*implementation-defined*/ streamsize;
```

The type `std::streamsize` is a signed integral type used to represent the number of characters transferred in an I/O operation or the size of an I/O buffer. It is used as a signed counterpart of `std::size_t`, similar to the POSIX type `ssize_t`.

## Notes

Except in the constructors of `std::strstreambuf`, negative values of `std::streamsize` are never used.

## Example

```cpp
#include <iostream>
#include <type_traits>

static_assert(std::is_signed_v<std::streamsize>);

int main()
{
    std::cout << sizeof(std::streamsize) << '\n';
}
```

Possible output:

```text
8
```

## See also

- [`gcount`](https://en.cppreference.com/w/cpp/io/basic_istream/gcount): returns number of characters extracted by last unformatted input operation (public member function of `std::basic_istream<CharT,Traits>`)
- [`ignore`](https://en.cppreference.com/w/cpp/io/basic_istream/ignore): extracts and discards characters until the given character is found (public member function of `std::basic_istream<CharT,Traits>`)
- [`read`](https://en.cppreference.com/w/cpp/io/basic_istream/read): extracts blocks of characters (public member function of `std::basic_istream<CharT,Traits>`)
- [`write`](https://en.cppreference.com/w/cpp/io/basic_ostream/write): inserts blocks of characters (public member function of `std::basic_ostream<CharT,Traits>`)
