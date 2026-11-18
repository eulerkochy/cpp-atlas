# std::wcslen

Source: https://en.cppreference.com/w/cpp/string/wide/wcslen

```cpp
// Defined in header <cwchar>
std::size_t wcslen( const wchar_t* str );
```

Returns the length of a wide string, that is the number of non-null wide characters that precede the terminating null wide character.

The behavior is undefined if there is no null character in the wide character array pointed to by `str`.

## Parameters

- `str` - pointer to the null-terminated wide string to be examined

## Return value

The length of the null-terminated wide string `str`.

## Possible implementation

```cpp
std::size_t wcslen(const wchar_t* start)
{
    // NB: start is not checked for nullptr!
    const wchar_t* end = start;
    while (*end != L'\0')
        ++end;
    return end - start;
}
```

## Example

```cpp
#include <iostream>
#include <cwchar>
int main()
{
    const wchar_t* str = L"Hello, world!";
    std::wcout << "The length of L\"" << str << "\" is " << std::wcslen(str) << '\n';
}
```

Output:

```text
The length of L"Hello, world!" is 13
```

## See also

- [`strlen`](https://en.cppreference.com/w/cpp/string/byte/strlen): returns the length of a given string (function)
- [`mblen`](https://en.cppreference.com/w/cpp/string/multibyte/mblen): returns the number of bytes in the next multibyte character (function)
- [C documentation for `wcslen`](https://en.cppreference.com/w/c/string/wide/wcslen)
