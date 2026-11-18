# operator==(std::layout_left::mapping)

Source: https://en.cppreference.com/w/cpp/container/mdspan/layout_left/mapping/operator==

```cpp
template< class OtherExtents >
friend constexpr bool operator==( const mapping& lhs,
                                  const mapping<OtherExtents>& rhs ) noexcept; // (since C++23)
```

Compares two layout mappings of the same layout type based on their underlying extents.

Layout mappings `lhs` and `rhs` compare equal if both `lhs.extents()` and `rhs.extents()` are equal.

This overload participates in overload resolution only if `extents_type::rank() == OtherExtents::rank()` is `true`.

## Parameters

- `lhs, rhs` - layout mappings whose extents to compare

## Return value

`true` if `lhs.extents() == rhs.extents()` is `true`, `false` otherwise

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`operator==`](https://en.cppreference.com/w/cpp/container/mdspan/layout_right/mapping/operator==): compares this layout mapping of `layout_right` with other mapping (function template)
- [`operator==`](https://en.cppreference.com/w/cpp/container/mdspan/layout_stride/mapping/operator==): compares this layout mapping of `layout_stride` with other mapping (function template)
- [`operator==`](https://en.cppreference.com/w/cpp/container/mdspan/extents/operator==) (C++23): compare underlying extents in each dimension of two `extents` (function)
