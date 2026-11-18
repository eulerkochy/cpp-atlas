# deduction guides for std::ranges::zip_view

Source: https://en.cppreference.com/w/cpp/ranges/zip_view/deduction_guides

```cpp
template< class... Rs >
zip_view( Rs&&... ) -> zip_view<views::all_t<Rs>...>; // (since C++23)
```

The deduction guide is provided for `std::ranges::zip_view` to allow deduction from `range`s.

## Example

> Note: This section is incomplete Reason: example
