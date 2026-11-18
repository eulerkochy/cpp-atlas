# deduction guides for std::ranges::slide_view

Source: https://en.cppreference.com/w/cpp/ranges/slide_view/deduction_guides

```cpp
// Defined in header <ranges>

template< class R >
slide_view( R&&, ranges::range_difference_t<R> ) -> slide_view<views::all_t<R>>; // (since C++23)
```

The deduction guide is provided for `std::ranges::slide_view` to allow deduction from `range` and number of elements.

## Example

> Note: This section is incomplete Reason: no example
