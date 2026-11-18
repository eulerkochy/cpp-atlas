# std::ranges::concat_view<Views...>::iterator<Const>::operator*

Source: https://en.cppreference.com/w/cpp/ranges/concat_view/iterator/operator*

```cpp
constexpr decltype(auto) operator*() const; // (since C++26)
```

Returns a reference to the current element in the `concat_view`.

Equivalent to `using reference = concat-reference-t <maybe-const <Const, Views>...>; return std::visit([](auto&& it) -> reference { return *it; }, it_);`.

If `it_.valueless_by_exception()` is `true`, the behavior is undefined.

## Return value

As described above.

## Notes

`operator->` is not provided.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`operator[]`](https://en.cppreference.com/w/cpp/ranges/concat_view/iterator/operator_at) (C++26): accesses an element by index (public member function)
