# std::experimental::basic_string_view<CharT,Traits>::size, std::experimental::basic_string_view<CharT,Traits>::length

Source: https://en.cppreference.com/w/cpp/experimental/basic_string_view/size

```cpp
constexpr size_type size() const noexcept; // (library fundamentals TS)
constexpr size_type length() const noexcept; // (library fundamentals TS)
```

Returns the number of `CharT` elements in the view, i.e. `std::distance(begin(), end())`.

## Parameters

(none)

## Return value

The number of `CharT` elements in the view.

## Complexity

Constant.

## See also

- [`empty`](https://en.cppreference.com/w/cpp/experimental/basic_string_view/empty): checks whether the view is empty (public member function)
- [`max_size`](https://en.cppreference.com/w/cpp/experimental/basic_string_view/max_size): returns the maximum number of characters (public member function)
