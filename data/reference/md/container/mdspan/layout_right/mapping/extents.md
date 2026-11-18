# std::layout_right::mapping<Extents>::extents

Source: https://en.cppreference.com/w/cpp/container/mdspan/layout_right/mapping/extents

```cpp
constexpr const extents_type& extents() const noexcept; // (since C++23)
```

Returns a const reference to the extents object. Equivalent to `return extents_;`.

## Parameters

(none)

## Return value

A const reference to the extents.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`extents`](https://en.cppreference.com/w/cpp/container/mdspan/extents_mfun): obtains the extents object (public member function of `std::mdspan<T,Extents,LayoutPolicy,AccessorPolicy>`)
