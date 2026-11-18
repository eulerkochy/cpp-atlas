# std::experimental::ranges::BoundedRange

Source: https://en.cppreference.com/w/cpp/experimental/ranges/range/BoundedRange

```cpp
// Defined in header <experimental/ranges/range>

template< class T >
concept bool BoundedRange =
    Range<T> &&
    Same<ranges::iterator_t<T>, ranges::sentinel_t<T>>; // (ranges TS)
```

> Note: This section is incomplete Reason: add description and extra caveats
