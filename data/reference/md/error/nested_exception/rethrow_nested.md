# std::nested_exception::rethrow_nested

Source: https://en.cppreference.com/w/cpp/error/nested_exception/rethrow_nested

```cpp
[[noreturn]] void rethrow_nested() const; // (since C++11) (constexpr since C++26)
```

Rethrows the stored exception. If there is no stored exceptions (i.e. `nested_ptr()` returns null pointer), then `std::terminate` is called.

## Parameters

(none)

## Return value

(none)
