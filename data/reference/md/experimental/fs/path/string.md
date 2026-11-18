# std::experimental::filesystem::path::string,wstring,u8string,...

Source: https://en.cppreference.com/w/cpp/experimental/fs/path/string

```cpp
template< class CharT, class Traits = std::char_traits<CharT>,
          class Alloc = std::allocator<CharT> >
std::basic_string<CharT,Traits,Alloc>
    string( const Alloc& a = Alloc() ) const; // (1) (filesystem TS)

std::string string() const; // (2)

std::wstring wstring() const; // (2)

std::string u8string() const; // (2)

std::u16string u16string() const; // (2)

std::u32string u32string() const; // (2)
```

Returns the internal pathname in native pathname format, converted to specific string type. Conversion, if any, is specified in todo.

1) All memory allocations are performed by `a`.

2) The encoding in the case of `u8string()` is always UTF-8.

## Parameters

(none)

## Return value

The internal pathname in native pathname format, converted to specified string type.

## Exceptions

May throw implementation-defined exceptions.

## Example

```cpp
#include <clocale>
#include <cstdio>
#include <experimental/filesystem>
#include <fstream>
#include <iostream>
namespace fs = std::experimental::filesystem;

int main()
{
    std::setlocale(LC_ALL, "en_US.utf8");
    std::locale::global(std::locale("en_US.utf8"));

    fs::path p = fs::u8path(u8"要らない.txt");

    // native string representation can be used with OS APIs
    std::ofstream(p) << "File contents"; // this uses operator string()
    if (std::FILE* f = std::fopen(p.c_str(), "r"))
    {
        int ch;
        while ((ch=fgetc(f))!= EOF) putchar(ch);
        std::fclose(f);
    }

    // multibyte and wide representation can be used for output
    std::cout.imbue(std::locale());
    std::cout << "\nFile name in narrow multibyte encoding: "
              << p.string() << '\n';

    std::wcerr.imbue(std::locale());
    std::wcerr << "File name in wide encoding: "
               << p.wstring() << '\n';

    fs::remove(p);
}
```

Possible output:

```text
File contents
File name in narrow multibyte encoding: 要らない.txt
File name in wide encoding: 要らない.txt
```

## See also

- [`generic_string`](https://en.cppreference.com/w/cpp/experimental/fs/path/generic_string), [`generic_wstring`](https://en.cppreference.com/w/cpp/experimental/fs/path/generic_string), [`generic_u8string`](https://en.cppreference.com/w/cpp/experimental/fs/path/generic_string), [`generic_u16string`](https://en.cppreference.com/w/cpp/experimental/fs/path/generic_string), [`generic_u32string`](https://en.cppreference.com/w/cpp/experimental/fs/path/generic_string): returns the path in generic pathname format converted to a string (public member function)
