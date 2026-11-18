# deduction guides for std::ranges::concat_view

Source: https://en.cppreference.com/w/cpp/ranges/concat_view/deduction_guides

```cpp
// Defined in header <ranges>

template< class... Rs >
concat_view( Rs&&... ) -> concat_view<views::all_t<Rs>...>; // (since C++26)
```

The deduction guide is provided for `concat_view` to allow deduction from `range`s.

## Example

> Note: This section is incomplete Reason: no example
