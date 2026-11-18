# std::mdspan<T,Extents,LayoutPolicy,AccessorPolicy>::rank_dynamic

Source: https://en.cppreference.com/w/cpp/container/mdspan/rank_dynamic

```cpp
static constexpr rank_type rank_dynamic() noexcept; // (since C++23)
```

Returns the number of dynamic dimensions in a `mdspan`. Equivalent to `return Extents::rank_dynamic()`.

## Parameters

(none)

## Return value

The number of dynamic dimensions.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`rank_dynamic`](https://en.cppreference.com/w/cpp/container/mdspan/extents/rank_dynamic) [static]: returns the dynamic rank of an `extents` (public static member function of `std::extents<IndexType,Extents...>`)
- [`rank`](https://en.cppreference.com/w/cpp/container/mdspan/rank) [static]: returns the rank of a `mdspan` (public static member function)
