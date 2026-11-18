# swap(std::copyable_function)

Source: https://en.cppreference.com/w/cpp/utility/functional/copyable_function/swap2

```cpp
friend void swap( std::copyable_function& lhs, std::copyable_function& rhs ) noexcept; // (since C++26)
```

Overloads the `std::swap` algorithm for `std::copyable_function`. Exchanges the state of `lhs` with that of `rhs`. Effectively calls `lhs.swap(rhs)`.

This function is not visible to ordinary unqualified or qualified lookup, and can only be found by argument-dependent lookup when `std::copyable_function<FunctionType>` is an associated class of the arguments.

## Parameters

- `lhs, rhs` - `std::copyable_function` objects whose states to swap

## Return value

(none)

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`swap`](https://en.cppreference.com/w/cpp/utility/functional/copyable_function/swap): swaps the targets of two `std::copyable_function` objects (public member function)
- [`std::swap(std::function)`](https://en.cppreference.com/w/cpp/utility/functional/function/swap2) (C++11): specializes the `std::swap` algorithm (function template)
- [`swap(std::move_only_function)`](https://en.cppreference.com/w/cpp/utility/functional/move_only_function/swap2) (C++23): specializes the `std::swap` algorithm (function)
