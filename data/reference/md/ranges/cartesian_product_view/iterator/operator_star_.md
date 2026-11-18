# std::ranges::cartesian_product_view<First, Vs...>::iterator<Const>::operator*

Source: https://en.cppreference.com/w/cpp/ranges/cartesian_product_view/iterator/operator*

```cpp
constexpr auto operator*() const; // (since C++23)
```

Returns the current element in the `cartesian_product_view`. Equivalent to:

`return /*tuple-transform*/([](auto& i) -> decltype(auto) { return *i; }, current_);`.

## Parameters

(none)

## Return value

The current element.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`operator[]`](https://en.cppreference.com/w/cpp/ranges/cartesian_product_view/iterator/operator_at) (C++23): accesses an element by index (public member function)
