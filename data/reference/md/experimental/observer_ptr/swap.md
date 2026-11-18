# std::experimental::observer_ptr<W>::swap

Source: https://en.cppreference.com/w/cpp/experimental/observer_ptr/swap

```cpp
constexpr void swap( observer_ptr& other ) noexcept; // (library fundamentals TS v2)
```

Swaps the watched object of `*this` and another `observer_ptr` object `other`, by invoking `swap` on the stored pointers of `*this` and `other`.

## Parameters

- `other` - another `observer_ptr` object to swap the watched object with

## Return value

(none)

## Example

> Note: This section is incomplete Reason: no example
