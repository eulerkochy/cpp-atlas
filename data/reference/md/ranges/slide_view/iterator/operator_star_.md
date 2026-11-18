# std::ranges::slide_view<V>::iterator<Const>::operator*

Source: https://en.cppreference.com/w/cpp/ranges/slide_view/iterator/operator*

```cpp
constexpr auto operator*() const; // (since C++23)
```

Returns the current element in the `slide_view`.

Let `current_` and `n_` be the underlying data members. Equivalent to: `return views::counted(current_, n_)`.

## Parameters

(none)

## Return value

The current element, which is an object of `value_type`.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`operator[]`](https://en.cppreference.com/w/cpp/ranges/slide_view/iterator/operator_at) (C++23): accesses an element by index (public member function)
