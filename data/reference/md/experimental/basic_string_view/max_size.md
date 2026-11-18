# std::experimental::basic_string_view<CharT,Traits>::max_size

Source: https://en.cppreference.com/w/cpp/experimental/basic_string_view/max_size

```cpp
constexpr size_type max_size() const noexcept; // (library fundamentals TS)
```

The largest possible number of char-like objects that can be referred to by a `basic_string_view`.

## Parameters

(none)

## Return value

Maximum number of characters.

## Complexity

Constant.

## See also

- [`size`](https://en.cppreference.com/w/cpp/experimental/basic_string_view/size), [`length`](https://en.cppreference.com/w/cpp/experimental/basic_string_view/size): returns the number of characters (public member function)
- [`empty`](https://en.cppreference.com/w/cpp/experimental/basic_string_view/empty): checks whether the view is empty (public member function)
