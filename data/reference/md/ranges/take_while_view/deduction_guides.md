# deduction guides for std::ranges::take_while_view

Source: https://en.cppreference.com/w/cpp/ranges/take_while_view/deduction_guides

```cpp
// Defined in header <ranges>

template< class R, class Pred >
take_while_view( R&&, Pred ) -> take_while_view<views::all_t<R>, Pred>; // (since C++20)
```

The deduction guide is provided for `std::ranges::take_while_view` to allow deduction from `range` and predicate.

## Example

> Note: This section is incomplete Reason: no example
