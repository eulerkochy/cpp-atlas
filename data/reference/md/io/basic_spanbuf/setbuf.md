# std::basic_spanbuf<CharT,Traits>::setbuf

Source: https://en.cppreference.com/w/cpp/io/basic_spanbuf/setbuf

```cpp
protected:
std::basic_streambuf<CharT, Traits>* setbuf( CharT *s, std::streamsize n ) override; // (since C++23)
```

Makes the `basic_spanbuf` perform I/O on the buffer `[s,` `s + n)`. Equivalently calls `this->span(std::span<CharT>(s, n))` and then returns `this`.

| Set bits in open mode (affecting pointers to get area) | Return value after setting |   |   |
| --- | --- | --- | --- |
| Set bits in open mode (affecting pointers to get area) | `eback()` | `gptr()` | `egptr()` |
| `std::ios_base::in` | `s` | `s` | `s + n` |
| Set bits in open mode (affecting pointers to put area) | Return value after setting |   |   |
| Set bits in open mode (affecting pointers to put area) | `pbase()` | `pptr()` | `epptr()` |
| `std::ios_base::out && !std::ios_base::ate` | `s` | `s` | `s + n` |
| `std::ios_base::out && std::ios_base::ate` | `s` | `s + n` | `s + n` |

This function is protected virtual, it may only be called through `pubsetbuf()` or from member functions of a user-defined class derived from `std::basic_spanbuf`.

## Parameters

- `s` - pointer to the first `CharT` in the user-provided buffer
- `n` - the number of `CharT` elements in the user-provided buffer

## Return value

`this`

## Notes

The deprecated stream buffer `std::strstreambuf` or the boost.IOStreams device `boost::basic_array` can also implement I/O buffering over a user-provided `char` array.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`pubsetbuf`](https://en.cppreference.com/w/cpp/io/basic_streambuf/pubsetbuf): invokes `setbuf()` (public member function of `std::basic_streambuf<CharT,Traits>`)
- [`setbuf`](https://en.cppreference.com/w/cpp/io/basic_stringbuf/setbuf) [virtual]: attempts to replace the controlled character sequence with an array (virtual protected member function of `std::basic_stringbuf<CharT,Traits,Allocator>`)
- [`setbuf`](https://en.cppreference.com/w/cpp/io/strstreambuf/setbuf) [virtual]: attempts to replace the controlled character sequence with an array (virtual protected member function of `std::strstreambuf`)
