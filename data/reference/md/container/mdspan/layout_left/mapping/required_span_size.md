# std::layout_left::mapping<Extents>::stride

Source: https://en.cppreference.com/w/cpp/container/mdspan/layout_left/mapping/required_span_size

```cpp
constexpr index_type required_span_size() const noexcept; // (since C++23)
```

Returns the required size of the mapping.

Equivalent to `return extents().fwd-prod-of-extents(extents_type::rank());`.

## Return value

The required size of the mapping.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`required_span_size`](https://en.cppreference.com/w/cpp/container/mdspan/layout_right/mapping/required_span_size): returns the required size of the mapping (public member function of `std::layout_right::mapping<Extents>`)
- [`required_span_size`](https://en.cppreference.com/w/cpp/container/mdspan/layout_stride/mapping/required_span_size): returns the required size of the mapping (public member function of `std::layout_stride::mapping<Extents>`)
- [`size`](https://en.cppreference.com/w/cpp/container/mdspan/size): returns the size of the multidimensional index space (public member function of `std::mdspan<T,Extents,LayoutPolicy,AccessorPolicy>`)
