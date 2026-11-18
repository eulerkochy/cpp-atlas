# std::ranges::view_interface<D>::cend

Source: https://en.cppreference.com/w/cpp/ranges/view_interface/cend

```cpp
constexpr auto cend(); // (1) (since C++23)
constexpr auto cend() const requires ranges::range<const D>; // (2) (since C++23)
```

The default implementation of `cend()` member function returns the sentinel for the constant iterator of the range.

1) Let `derived` be a reference bound to `static_cast<D&>(*this)`. Equivalent to `return ranges::cend(derived);`.

2) Same as (1), except that `derived` is `static_cast<const D&>(*this)`.

## Parameters

(none)

## Return value

The sentinel for the constant iterator of the range.

## Notes

All range adaptors and range factories in the standard library and `std::ranges::subrange` use the default implementation of `cend`.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`end`](https://en.cppreference.com/w/cpp/iterator/end) (C++11), [`cend`](https://en.cppreference.com/w/cpp/iterator/end) (C++14): returns an iterator to the end of a container or array (function template)
- [`ranges::cend`](https://en.cppreference.com/w/cpp/ranges/cend) (C++20): returns a sentinel indicating the end of a read-only range (customization point object)
