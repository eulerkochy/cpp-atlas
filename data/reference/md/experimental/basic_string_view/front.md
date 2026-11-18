# std::experimental::basic_string_view<CharT,Traits>::front

Source: https://en.cppreference.com/w/cpp/experimental/basic_string_view/front

```cpp
constexpr const_reference front() const; // (library fundamentals TS)
```

Returns reference to the first character in the view.

## Parameters

(none)

## Return value

reference to the first character, equivalent to `operator[](0)`.

## Complexity

Constant.

## See also

- [`back`](https://en.cppreference.com/w/cpp/experimental/basic_string_view/back): accesses the last character (public member function)
