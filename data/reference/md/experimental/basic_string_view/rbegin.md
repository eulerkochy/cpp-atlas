# std::experimental::basic_string_view<CharT,Traits>::rbegin, std::experimental::basic_string_view<CharT,Traits>::crbegin

Source: https://en.cppreference.com/w/cpp/experimental/basic_string_view/rbegin

```cpp
constexpr const_reverse_iterator rbegin() const noexcept; // (library fundamentals TS)
constexpr const_reverse_iterator crbegin() const noexcept; // (library fundamentals TS)
```

Returns a reverse iterator to the first character of the reversed view. It corresponds to the last character of the non-reversed view.

## Parameters

(none)

## Return value

`const_reverse_iterator` to the first character

## Complexity

Constant

## See also

- [`rend`](https://en.cppreference.com/w/cpp/experimental/basic_string_view/rend), [`crend`](https://en.cppreference.com/w/cpp/experimental/basic_string_view/rend): returns a reverse iterator to the end (public member function)
