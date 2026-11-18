# std::operator==,!=,<,<=>(std::error_code)

Source: https://en.cppreference.com/w/cpp/error/error_code/operator_cmp

```cpp
// Defined in header <system_error>

bool operator==( const std::error_code& lhs,
                 const std::error_code& rhs ) noexcept; // (1) (since C++11)

bool operator!=( const std::error_code& lhs,
                 const std::error_code& rhs ) noexcept; // (2) (since C++11) (until C++20)

bool operator<( const std::error_code& lhs,
                const std::error_code& rhs ) noexcept; // (3) (since C++11) (until C++20)

std::strong_ordering operator<=>( const std::error_code& lhs,
                                  const std::error_code& rhs ) noexcept; // (4) (since C++20)
```

Compares two error code objects.

1) Compares `lhs` and `rhs` for equality.

2) Compares `lhs` and `rhs` for equality.

3) Checks whether `lhs` is less than `rhs`.

4) Obtains three-way comparison result of `lhs` and `rhs`.

The `<`, `<=`, `>`, `>=`, and `!=` operators are synthesized from `operator<=>` and `operator==` respectively. (since C++20)

## Parameters

- `lhs, rhs` - error codes to compare

## Return value

1) `true` if the error category and error value compare equal.

2) `true` if the error category or error value compare are not equal.

3) `true` if `lhs.category() < rhs.category()`. Otherwise, `true` if `lhs.category() == rhs.category() && lhs.value() < rhs.value()`. Otherwise, `false`.

4) `lhs.category() <=> rhs.category()` if it is not `std::strong_ordering::equal`. Otherwise, `lhs.value() <=> rhs.value()`.

## See also

- [`category`](https://en.cppreference.com/w/cpp/error/error_code/category): obtains the error_category for this error_code (public member function)
- [`value`](https://en.cppreference.com/w/cpp/error/error_code/value): obtains the value of the `error_code` (public member function)
- [`operator==`](https://en.cppreference.com/w/cpp/error/error_condition/operator_cmp), [`operator!=`](https://en.cppreference.com/w/cpp/error/error_condition/operator_cmp) (removed in C++20), [`operator<`](https://en.cppreference.com/w/cpp/error/error_condition/operator_cmp) (removed in C++20), [`operator<=>`](https://en.cppreference.com/w/cpp/error/error_condition/operator_cmp) (C++20): compares `error_condition`s and `error_code`s (function)
