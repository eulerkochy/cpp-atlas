# std::ranges::slide_view<V>::iterator<Const>::operator[]

Source: https://en.cppreference.com/w/cpp/ranges/slide_view/iterator/operator_at

```cpp
constexpr auto operator[]( difference_type pos ) const
    requires ranges::random_access_range<Base>; // (since C++23)
```

Returns an element at specified relative location.

Let `current_` and `n_` be the underlying data members. Equivalent to: `return views::counted(current_ + pos, n_);`.

## Parameters

- `pos` - position relative to current location

## Return value

The element (of type `value_type`) at displacement `pos` relative to the current location.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`operator*`](https://en.cppreference.com/w/cpp/ranges/slide_view/iterator/operator*) (C++23): accesses the element (public member function)
