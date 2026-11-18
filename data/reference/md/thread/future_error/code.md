# std::future_error::code

Source: https://en.cppreference.com/w/cpp/thread/future_error/code

```cpp
const std::error_code& code() const noexcept; // (since C++11)
```

Returns the stored error code.

## Parameters

(none)

## Return value

The stored error code.

## See also

- [`what`](https://en.cppreference.com/w/cpp/thread/future_error/what): returns the explanatory string specific to the error code (public member function)
