# std::experimental::filesystem::path::generic_string,generic_wstring,generic_u8string,...

Source: https://en.cppreference.com/w/cpp/experimental/fs/path/generic_string

```cpp
template< class CharT, class Traits = std::char_traits<CharT>,
          class Alloc = std::allocator<CharT> >
std::basic_string<CharT,Traits,Alloc>
    generic_string( const Alloc& a = Alloc() ) const; // (1) (filesystem TS)

std::string generic_string() const; // (2)

std::wstring generic_wstring() const; // (2)

std::string generic_u8string() const; // (2)

std::u16string generic_u16string() const; // (2)

std::u32string generic_u32string() const; // (2)
```

Returns the internal pathname in generic pathname format, converted to specific string type. Conversion, if any, is specified in todo. The `/` character is used as the directory separator.

1) All memory allocations are performed by `a`.

2) The encoding in the case of `u8string()` is always UTF-8.

## Parameters

- `a` - allocator to construct the string with
- `CharT` must be one of the encoded character types (`char`, `wchar_t`, `char16_t` and `char32_t`)

## Return value

The internal pathname in generic pathname format, converted to specified string type.

## Exceptions

May throw implementation-defined exceptions.

## See also

- [`string`](https://en.cppreference.com/w/cpp/experimental/fs/path/string), [`wstring`](https://en.cppreference.com/w/cpp/experimental/fs/path/string), [`u8string`](https://en.cppreference.com/w/cpp/experimental/fs/path/string), [`u16string`](https://en.cppreference.com/w/cpp/experimental/fs/path/string), [`u32string`](https://en.cppreference.com/w/cpp/experimental/fs/path/string): returns the path in native pathname format converted to a string (public member function)
