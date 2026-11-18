# std::ranges::subrange<I,S,K>::end

Source: https://en.cppreference.com/w/cpp/ranges/subrange/end

```cpp
constexpr S end() const; // (since C++20)
```

Returns the sentinel indicating the end of the `subrange`.

## Return value

`end_`.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`begin`](https://en.cppreference.com/w/cpp/ranges/subrange/begin): obtains the iterator (public member function)
- [`end`](https://en.cppreference.com/w/cpp/iterator/end) (C++11), [`cend`](https://en.cppreference.com/w/cpp/iterator/end) (C++14): returns an iterator to the end of a container or array (function template)
- [`ranges::end`](https://en.cppreference.com/w/cpp/ranges/end) (C++20): returns a sentinel indicating the end of a range (customization point object)
