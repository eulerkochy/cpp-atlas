# std::chrono::operator<< (std::chrono::local_info)

Source: https://en.cppreference.com/w/cpp/chrono/local_info/operator_ltlt

```cpp
// Defined in header <chrono>

template< class CharT, class Traits >
std::basic_ostream<CharT, Traits>& operator<<( std::basic_ostream<CharT, Traits>& os,
                                               const std::chrono::local_info& r ); // (since C++20)
```

Inserts a textual representation of `r` into `os`. The exact format is unspecified.

## Return value

`os`
