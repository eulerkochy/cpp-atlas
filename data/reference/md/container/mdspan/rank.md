# std::mdspan<T,Extents,LayoutPolicy,AccessorPolicy>::rank

Source: https://en.cppreference.com/w/cpp/container/mdspan/rank

```cpp
static constexpr rank_type rank() noexcept; // (since C++23)
```

Returns the number of dimensions in a `mdspan`. Equivalent to `return Extents::rank()`.

## Parameters

(none)

## Return value

The number of dimensions.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`rank`](https://en.cppreference.com/w/cpp/container/mdspan/extents/rank) [static]: returns the static rank of an `extents` (public static member function of `std::extents<IndexType,Extents...>`)
- [`rank_dynamic`](https://en.cppreference.com/w/cpp/container/mdspan/rank_dynamic) [static]: returns the dynamic rank of a `mdspan` (public static member function)
