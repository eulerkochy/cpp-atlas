# std::experimental::basic_string_view<CharT,Traits>::empty

Source: https://en.cppreference.com/w/cpp/experimental/basic_string_view/empty

```cpp
constexpr bool empty() const noexcept; // (library fundamentals TS)
```

Checks if the view has no characters, i.e. whether `size() == 0`.

## Parameters

(none)

## Return value

`true` if the view is empty, `false` otherwise

## Complexity

Constant.

## See also

- [`size`](https://en.cppreference.com/w/cpp/experimental/basic_string_view/size), [`length`](https://en.cppreference.com/w/cpp/experimental/basic_string_view/size): returns the number of characters (public member function)
- [`max_size`](https://en.cppreference.com/w/cpp/experimental/basic_string_view/max_size): returns the maximum number of characters (public member function)
