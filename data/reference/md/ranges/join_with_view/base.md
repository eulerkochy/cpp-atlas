# std::ranges::join_with_view<V,Pattern>::base

Source: https://en.cppreference.com/w/cpp/ranges/join_with_view/base

```cpp
constexpr V base() const& requires std::copy_constructible<V>; // (1) (since C++23)
constexpr V base() &&; // (2) (since C++23)
```

Returns a copy of the underlying view.

## Return value

1) `base_`

2) `std::move(base_)`

## Example

> Note: This section is incomplete Reason: no example
