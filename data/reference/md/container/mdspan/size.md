# std::mdspan<T,Extents,LayoutPolicy,AccessorPolicy>::size

Source: https://en.cppreference.com/w/cpp/container/mdspan/size

```cpp
constexpr size_type size() const noexcept; // (since C++23)
```

Returns the number of elements in `mdspan`.

Equivalent to `extents().fwd-prod-of-extents(rank())`.

The size of the multidimensional index space `extents()` must be representable as a value of type `size_type`. Otherwise, the behavior is undefined.

## Return value

The number of elements.

## Example

> Note: This section is incomplete Reason: no example

## See also

> Note: This section is incomplete
