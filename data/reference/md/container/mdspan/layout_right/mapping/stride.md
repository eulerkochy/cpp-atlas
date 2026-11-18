# std::layout_right::mapping<Extents>::stride

Source: https://en.cppreference.com/w/cpp/container/mdspan/layout_right/mapping/stride

```cpp
constexpr index_type stride(rank_type i) const noexcept; // (since C++23)
```

Returns the stride of the mapping at a rank index `i`. Equivalent to `return extents().rev-prod-of-extents(i);`.

This overload participates in overload resolution only if `extents_type​::​rank() > 0` is `true`.

The behavior is undefined if `i >= extents_type::rank()` is `true`.

## Parameters

- `i` - a rank index in the range `[​0​,` `extents_type::rank())`

## Return value

The stride at a specified rank index.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`stride`](https://en.cppreference.com/w/cpp/container/mdspan/layout_stride/mapping/stride): obtains the stride along the specified dimension (public member function of `std::layout_stride::mapping<Extents>`)
- [`stride`](https://en.cppreference.com/w/cpp/container/mdspan/stride): obtains the stride along the specified dimension (public member function of `std::mdspan<T,Extents,LayoutPolicy,AccessorPolicy>`)
