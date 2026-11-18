# std::experimental::swap(std::experimental::any)

Source: https://en.cppreference.com/w/cpp/experimental/any/swap2

```cpp
void swap(any& lhs, any& rhs) noexcept; // (library fundamentals TS)
```

Swaps the content of two `any` objects. Calls `lhs.swap(rhs)`.

## Parameters

- `lhs, rhs` - objects to swap

## Return value

(none)

## See also

- [`swap`](https://en.cppreference.com/w/cpp/experimental/any/swap): swaps two `any` objects (public member function)
