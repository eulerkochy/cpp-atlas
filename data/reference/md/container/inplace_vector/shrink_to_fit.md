# std::inplace_vector<T,N>::shrink_to_fit

Source: https://en.cppreference.com/w/cpp/container/inplace_vector/shrink_to_fit

```cpp
static constexpr void shrink_to_fit() noexcept; // (since C++26)
```

Does nothing.

Nominally, this function is a non-binding request to decrease capacity so that the internal storage contains only `size()` elements. However, such a request is always ignored by the fixed-capacity container `std::inplace_vector<T, N>`.

## Parameters

(none)

## Return value

(none)

## Complexity

Constant.

## Notes

This function exists for compatibility with vector-like interfaces.

## See also

- [`size`](https://en.cppreference.com/w/cpp/container/inplace_vector/size): returns the number of elements (public member function)
- [`resize`](https://en.cppreference.com/w/cpp/container/inplace_vector/resize): changes the number of elements stored (public member function)
- [`capacity`](https://en.cppreference.com/w/cpp/container/inplace_vector/capacity) [static]: returns the number of elements that can be held in currently allocated storage (public static member function)
- [`shrink_to_fit`](https://en.cppreference.com/w/cpp/container/vector/shrink_to_fit) (DR*): reduces memory usage by freeing unused memory (public member function of `std::vector<T,Allocator>`)
- [`shrink_to_fit`](https://en.cppreference.com/w/cpp/container/deque/shrink_to_fit) (DR*): reduces memory usage by freeing unused memory (public member function of `std::deque<T,Allocator>`)
