# std::regex_error::code

Source: https://en.cppreference.com/w/cpp/regex/regex_error/code

```cpp
// Defined in header <regex>
std::regex_constants::error_type code() const; // (since C++11)
```

Returns the `std::regex_constants::error_type` that was passed to the `std::regex_error` constructor.

## See also

- [`error_type`](https://en.cppreference.com/w/cpp/regex/error_type) (C++11): describes different types of matching errors (typedef)
- [(constructor)](https://en.cppreference.com/w/cpp/regex/regex_error/regex_error): constructs a `regex_error` object (public member function)
