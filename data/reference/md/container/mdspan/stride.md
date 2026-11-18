# std::mdspan<T,Extents,LayoutPolicy,AccessorPolicy>::stride

Source: https://en.cppreference.com/w/cpp/container/mdspan/stride

```cpp
constexpr index_type stride( rank_type r ) const; // (since C++23)
```

Returns the stride of the layout mapping `map_` in `r`th dimension. Equivalent to `return map_.stride(r);`.

## Parameters

- `r` - the index of the dimension

## Return value

The stride.

## Example

> Note: This section is incomplete Reason: no example

## See also

> Note: This section is incomplete
