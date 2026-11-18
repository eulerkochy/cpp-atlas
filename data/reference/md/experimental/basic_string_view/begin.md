# std::experimental::basic_string_view<CharT,Traits>::begin, std::experimental::basic_string_view<CharT,Traits>::cbegin

Source: https://en.cppreference.com/w/cpp/experimental/basic_string_view/begin

```cpp
constexpr const_iterator begin() const noexcept; // (library fundamentals TS)
constexpr const_iterator cbegin() const noexcept; // (library fundamentals TS)
```

Returns an iterator to the first character of the view.

## Parameters

(none)

## Return value

`const_iterator` to the first character

## Complexity

Constant

## See also

- [`end`](https://en.cppreference.com/w/cpp/experimental/basic_string_view/end), [`cend`](https://en.cppreference.com/w/cpp/experimental/basic_string_view/end): returns an iterator to the end (public member function)
