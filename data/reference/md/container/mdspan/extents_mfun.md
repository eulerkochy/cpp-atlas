# std::mdspan<T,Extents,LayoutPolicy,AccessorPolicy>::extents

Source: https://en.cppreference.com/w/cpp/container/mdspan/extents_mfun

```cpp
constexpr const extents_type& extents() const noexcept; // (since C++23)
```

Returns a const reference to the extents of the layout mapping `map_`. Equivalent to `return map_.extents();`.

## Parameters

(none)

## Return value

A const reference to the extents.

## Example

> Note: This section is incomplete Reason: no example

## See also

> Note: This section is incomplete
