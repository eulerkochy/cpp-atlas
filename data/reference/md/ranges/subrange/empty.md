# std::ranges::subrange<I,S,K>::empty

Source: https://en.cppreference.com/w/cpp/ranges/subrange/empty

```cpp
constexpr bool empty() const; // (since C++20)
```

Checks whether the `subrange` is empty.

## Return value

`begin_ == end_`.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`size`](https://en.cppreference.com/w/cpp/ranges/subrange/size): obtains the size of the `subrange` (public member function)
- [`empty`](https://en.cppreference.com/w/cpp/iterator/empty) (C++17): checks whether the container is empty (function template)
- [`ranges::empty`](https://en.cppreference.com/w/cpp/ranges/empty) (C++20): checks whether a range is empty (customization point object)
