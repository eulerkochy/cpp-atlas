# std::ranges::concat_view<Views...>::iterator<Const>::operator[]

Source: https://en.cppreference.com/w/cpp/ranges/concat_view/iterator/operator_at

```cpp
constexpr decltype(auto) operator[]( difference_type pos ) const
    requires /*concat-is-random-access*/<Const, Views...>; // (since C++26)
```

Returns a reference to an element at specified relative location.

## Parameters

- `pos` - position relative to current location

## Return value

`*((*this) + pos)`

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`operator*`](https://en.cppreference.com/w/cpp/ranges/concat_view/iterator/operator*) (C++26): accesses the element (public member function)
