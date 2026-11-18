# std::ranges::subrange<I,S,K>::begin

Source: https://en.cppreference.com/w/cpp/ranges/subrange/begin

```cpp
constexpr I begin() const requires std::copyable<I>; // (1) (since C++20)
constexpr I begin() requires (!std::copyable<I>); // (2) (since C++20)
```

Obtains the iterator to the beginning of the `subrange`.

## Return value

1) `begin_`.

2) `std::move(begin_)`.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`end`](https://en.cppreference.com/w/cpp/ranges/subrange/end): obtains the sentinel (public member function)
- [`begin`](https://en.cppreference.com/w/cpp/iterator/begin) (C++11), [`cbegin`](https://en.cppreference.com/w/cpp/iterator/begin) (C++14): returns an iterator to the beginning of a container or array (function template)
- [`ranges::begin`](https://en.cppreference.com/w/cpp/ranges/begin) (C++20): returns an iterator to the beginning of a range (customization point object)
