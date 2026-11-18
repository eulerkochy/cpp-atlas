# std::make_error_code(std::future_errc)

Source: https://en.cppreference.com/w/cpp/thread/future_errc/make_error_code

```cpp
// Defined in header <future>
std::error_code make_error_code( std::future_errc e ); // (since C++11)
```

Constructs an `std::error_code` object from a value of type `std::future_errc` as if by:

`std::error_code(static_cast<int>(e), std::future_category())`.

This function is called by the constructor of `std::error_code` when given an `std::future_errc` argument.

## Parameters

- `e` - error code number

## Return value

A value of type `std::error_code` that holds the error code number from `e` associated with the error category `"future"`.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`error_code`](https://en.cppreference.com/w/cpp/error/error_code) (C++11): holds a platform-dependent error code (class)
- [`future_errc`](https://en.cppreference.com/w/cpp/thread/future_errc) (C++11): identifies the future error codes (enum)
- [`make_error_code(std::errc)`](https://en.cppreference.com/w/cpp/error/errc/make_error_code) (C++11): creates error code value for `errc` enum `e` (function)
- [`make_error_code(std::io_errc)`](https://en.cppreference.com/w/cpp/io/io_errc/make_error_code) (C++11): constructs an iostream error code (function)
