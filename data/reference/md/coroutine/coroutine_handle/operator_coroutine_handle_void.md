# std::coroutine_handle<Promise>::operator coroutine_handle<>

Source: https://en.cppreference.com/w/cpp/coroutine/coroutine_handle/operator_coroutine_handle_void

```cpp
constexpr operator coroutine_handle<>() const noexcept; // (since C++20)
```

This conversion function converts a `std::coroutine_handle<Promise>` value to a `std::coroutine_handle<>` holding the same underlying address. It effectively erases the promise type.

## Parameters

(none)

## Return value

`std::coroutine_handle<>::from_address(address())`

## See also

- [`operator==`](https://en.cppreference.com/w/cpp/coroutine/coroutine_handle/operator_cmp) (C++20), [`operator<=>`](https://en.cppreference.com/w/cpp/coroutine/coroutine_handle/operator_cmp): compares two `coroutine_handle` objects (function)
