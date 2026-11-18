# std::future_category

Source: https://en.cppreference.com/w/cpp/thread/future_category

```cpp
// Defined in header <future>
const std::error_category& future_category() noexcept; // (since C++11)
```

Obtains a reference to the static error category object for the errors related to futures and promises. The object is required to override the virtual function `error_category::name()` to return a pointer to the string `"future"`. It is used to identify error codes provided in the exceptions of type `std::future_error`.

## Parameters

(none)

## Return value

A reference to the static object of unspecified runtime type, derived from `std::error_category`.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`future_errc`](https://en.cppreference.com/w/cpp/thread/future_errc) (C++11): identifies the future error codes (enum)
- [`future_error`](https://en.cppreference.com/w/cpp/thread/future_error) (C++11): reports an error related to futures or promises (class)
- [`error_category`](https://en.cppreference.com/w/cpp/error/error_category) (C++11): base class for error categories (class)
