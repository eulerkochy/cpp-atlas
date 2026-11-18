# std::experimental::ranges::ForwardRange

Source: https://en.cppreference.com/w/cpp/experimental/ranges/range/ForwardRange

```cpp
// Defined in header <experimental/ranges/range>

template< class T >
concept bool ForwardRange =
    InputRange<T> && ForwardIterator<ranges::iterator_t<T>>; // (ranges TS)
```

> Note: This section is incomplete Reason: add description and extra caveats
