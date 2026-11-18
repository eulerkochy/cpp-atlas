# std::basic_osyncstream<CharT,Traits,Allocator>::rdbuf

Source: https://en.cppreference.com/w/cpp/io/basic_osyncstream/rdbuf

```cpp
syncbuf_type* rdbuf() const noexcept;
```

Returns a pointer to the underlying `std::basic_syncbuf`.

## Parameters

(none)

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`get_wrapped`](https://en.cppreference.com/w/cpp/io/basic_osyncstream/get_wrapped): obtains a pointer to the final destination stream buffer (public member function)
- [`rdbuf`](https://en.cppreference.com/w/cpp/io/basic_ios/rdbuf): manages associated stream buffer (public member function of `std::basic_ios<CharT,Traits>`)
