# std::ranges::chunk_view<V>::iterator<Const>::operator*

Source: https://en.cppreference.com/w/cpp/ranges/chunk_view/iterator/operator*

```cpp
constexpr value_type operator*() const; // (since C++23)
```

Returns the current element in the `chunk_view`.

Let `current_`, `end_`, and `n_` be the underlying data members.

Equivalent to: `return views::take(ranges::subrange(current_, end_), n_)`.

Before the invocation the expression `current_ != end_` must be `true`, otherwise the behavior is undefined.

## Parameters

(none)

## Return value

The current element, which is an object of `value_type`.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`operator[]`](https://en.cppreference.com/w/cpp/ranges/chunk_view/iterator/operator_at) (C++23): accesses an element by index (public member function)
