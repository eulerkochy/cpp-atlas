# std::basic_streambuf<CharT,Traits>::sbumpc, std::basic_streambuf<CharT,Traits>::stossc

Source: https://en.cppreference.com/w/cpp/io/basic_streambuf/sbumpc

```cpp
int_type sbumpc(); // (1)
void stossc(); // (2) (deprecated in C++98) (removed in C++17)
```

Reads one character and advances the input sequence by one character.

1) If the input sequence read position is not available, returns `uflow()`. Otherwise returns `Traits::to_int_type(*gptr())`.

2) Same as (1), but discards the result.

## Parameters

(none)

## Return value

1) The value of the character pointed to by the *get pointer*, or `Traits::eof()` if the read position is not available.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`sgetc`](https://en.cppreference.com/w/cpp/io/basic_streambuf/sgetc): reads one character from the input sequence without advancing the sequence (public member function)
- [`snextc`](https://en.cppreference.com/w/cpp/io/basic_streambuf/snextc): advances the input sequence, then reads one character without advancing again (public member function)
