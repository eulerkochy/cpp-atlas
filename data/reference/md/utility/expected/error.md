# std::expected<T,E>::error

Source: https://en.cppreference.com/w/cpp/utility/expected/error

```cpp
constexpr const E& error() const& noexcept; // (1) (since C++23)
constexpr E& error() & noexcept; // (2) (since C++23)
constexpr const E&& error() const&& noexcept; // (3) (since C++23)
constexpr E&& error() && noexcept; // (4) (since C++23)
```

Accesses the unexpected value contained in `*this`.

If `has_value()` is `true`, the behavior is undefined.

## Return value

1,2) `unex`

3,4) `std::move(unex)`

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`error_or`](https://en.cppreference.com/w/cpp/utility/expected/error_or): returns the unexpected value if present, another value otherwise (public member function)
- [`operator->`](https://en.cppreference.com/w/cpp/utility/expected/operator*), [`operator*`](https://en.cppreference.com/w/cpp/utility/expected/operator*): accesses the expected value (public member function)
- [`value`](https://en.cppreference.com/w/cpp/utility/expected/value): returns the expected value (public member function)
- [`operator bool`](https://en.cppreference.com/w/cpp/utility/expected/operator_bool), [`has_value`](https://en.cppreference.com/w/cpp/utility/expected/operator_bool): checks whether the object contains an expected value (public member function)
