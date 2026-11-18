# std::system_error::what

Source: https://en.cppreference.com/w/cpp/error/system_error/what

```cpp
virtual const char* what() const noexcept; // (since C++11)
```

Returns the explanatory string.

## Parameters

(none)

## Return value

Pointer to a null-terminated string with explanatory information.

## See also

- [`code`](https://en.cppreference.com/w/cpp/error/system_error/code): returns error code (public member function)
