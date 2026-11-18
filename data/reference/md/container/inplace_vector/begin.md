# std::inplace_vector<T,N>::begin, std::inplace_vector<T,N>::cbegin

Source: https://en.cppreference.com/w/cpp/container/inplace_vector/begin

```cpp
constexpr iterator begin() noexcept; // (1) (since C++26)
constexpr const_iterator begin() const noexcept; // (2) (since C++26)
constexpr const_iterator cbegin() const noexcept; // (3) (since C++26)
```

Returns an iterator to the first element of the `inplace_vector`.

If the `inplace_vector` is empty, the returned iterator will be equal to `end()`.

## Parameters

(none)

## Return value

Iterator to the first element.

## Complexity

Constant.

## Example

Template:cpp/container/begin/examples/inplace vector

## See also

- [`end`](https://en.cppreference.com/w/cpp/container/inplace_vector/end), [`cend`](https://en.cppreference.com/w/cpp/container/inplace_vector/end): returns an iterator to the end (public member function)
- [`begin`](https://en.cppreference.com/w/cpp/iterator/begin) (C++11), [`cbegin`](https://en.cppreference.com/w/cpp/iterator/begin) (C++14): returns an iterator to the beginning of a container or array (function template)
