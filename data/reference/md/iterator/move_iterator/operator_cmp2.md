# operator==(std::move_iterator<Iter>, std::move_sentinel)

Source: https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_cmp2

```cpp
template< std::sentinel_for<Iter> S >
friend constexpr bool
    operator==( const move_iterator& i, const std::move_sentinel<S>& s ); // (since C++20)
```

Compares a `move_iterator` and a `move_sentinel`.

This overload participates in overload resolution only if `i.base() == s.base()` is well-formed and convertible to `bool`.

This function template is not visible to ordinary unqualified or qualified lookup, and can only be found by argument-dependent lookup when `std::move_iterator<Iter>` is an associated class of the arguments.

The `!=` operator is synthesized from `operator==`.

## Parameters

- `i` - the move iterator to compare
- `s` - the move sentinel to compare

## Return value

`i.base() == s.base()`

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`operator==`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_cmp) (C++11), [`operator!=`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_cmp) (C++11)(removed in C++20), [`operator<`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_cmp) (C++11), [`operator<=`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_cmp) (C++11), [`operator>`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_cmp) (C++11), [`operator>=`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_cmp) (C++11), [`operator<=>`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_cmp) (C++20): compares the underlying iterators (function template)
