# std::experimental::basic_string_view<CharT,Traits>::back

Source: https://en.cppreference.com/w/cpp/experimental/basic_string_view/back

```cpp
constexpr const_reference back() const; // (library fundamentals TS)
```

Returns reference to the last character in the view.

## Parameters

(none)

## Return value

Reference to the last character, equivalent to `operator[](size() - 1)`.

## Complexity

Constant.

## See also

- [`front`](https://en.cppreference.com/w/cpp/experimental/basic_string_view/front): accesses the first character (public member function)
