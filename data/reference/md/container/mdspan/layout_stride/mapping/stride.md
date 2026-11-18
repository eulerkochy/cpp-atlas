# std::layout_stride::mapping<Extents>::stride

Source: https://en.cppreference.com/w/cpp/container/mdspan/layout_stride/mapping/stride

```cpp
constexpr index_type stride(rank_type i) const noexcept; // (since C++23)
```

Returns the stride of the mapping at a rank index `i`. Equivalent to `return strides_[i];`

## Parameters

- `i` - a rank index in the range `[​0​,` `rank_)`

## Return value

The stride at a specified rank index.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`strides`](https://en.cppreference.com/w/cpp/container/mdspan/layout_stride/mapping/strides): obtains the array of strides (public member function)
- [`stride`](https://en.cppreference.com/w/cpp/container/mdspan/stride): obtains the stride along the specified dimension (public member function of `std::mdspan<T,Extents,LayoutPolicy,AccessorPolicy>`)
