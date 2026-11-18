# std::hash<std::basic_stacktrace>

Source: https://en.cppreference.com/w/cpp/utility/basic_stacktrace/hash

```cpp
// Defined in header <stacktrace>
template< class Allocator > struct hash<std::basic_stacktrace<Allocator>>; // (since C++23)
```

The template specialization of `std::hash` for `std::basic_stacktrace` allows users to obtain hashes of values of type `std::basic_stacktrace`.

`operator()` of this specialization is noexcept.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`hash`](https://en.cppreference.com/w/cpp/utility/hash) (C++11): hash function object (class template)
- [`std::hash<std::stacktrace_entry>`](https://en.cppreference.com/w/cpp/utility/stacktrace_entry/hash) (C++23): hash support for `std::stacktrace_entry` (class template specialization)
