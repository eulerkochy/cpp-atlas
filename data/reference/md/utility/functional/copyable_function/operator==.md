# operator==(std::copyable_function)

Source: https://en.cppreference.com/w/cpp/utility/functional/copyable_function/operator==

```cpp
friend bool operator==( const std::copyable_function& f, std::nullptr_t ) noexcept; // (since C++26)
```

Checks whether the wrapper `f` has a callable target by formally comparing it with `std::nullptr_t`. Empty wrappers (that is, wrappers without a target) compare equal, non-empty functions compare non-equal.

This function is not visible to ordinary unqualified or qualified lookup, and can only be found by argument-dependent lookup when `std::copyable_function<FunctionType>` is an associated class of the arguments.

The `!=` operator is synthesized from `operator==`.

## Parameters

- `f` - `std::copyable_function` to compare

## Return value

`!f`.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`operator bool`](https://en.cppreference.com/w/cpp/utility/functional/copyable_function/operator_bool): checks if the `std::copyable_function` has a target (public member function)
- [`operator==`](https://en.cppreference.com/w/cpp/utility/functional/function/operator_cmp), [`operator!=`](https://en.cppreference.com/w/cpp/utility/functional/function/operator_cmp) (removed in C++20): compares a `std::function` with `nullptr` (function template)
- [`operator==`](https://en.cppreference.com/w/cpp/utility/functional/move_only_function/operator==) (C++23): compares a `std::move_only_function` with `nullptr` (function)
