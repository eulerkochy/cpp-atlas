# std::hash<std::text_encoding>

Source: https://en.cppreference.com/w/cpp/text/text_encoding/hash

```cpp
// Defined in header <text_encoding>
template<> struct hash<std::text_encoding>; // (since C++26)
```

The template specialization of `std::hash` for `std::text_encoding` allows users to obtain hashes of encoded id and name of type `std::text_encoding`.

`operator()` of this specialization is noexcept.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`hash`](https://en.cppreference.com/w/cpp/utility/hash) (C++11): hash function object (class template)
- [`std::hash<std::basic_stacktrace>`](https://en.cppreference.com/w/cpp/utility/basic_stacktrace/hash) (C++23): hash support for `std::basic_stacktrace` (class template specialization)
