# std::mdspan<T,Extents,LayoutPolicy,AccessorPolicy>::mapping

Source: https://en.cppreference.com/w/cpp/container/mdspan/mapping

```cpp
constexpr const mapping_type& mapping() const noexcept; // (since C++23)
```

Returns the layout mapping. Equivalent to `return map_;`.

## Parameters

(none)

## Return value

A const reference to the underlying layout mapping object of `mapping_type`.

## Example

> Note: This section is incomplete Reason: no example

## See also

> Note: This section is incomplete
