# std::experimental::ranges::RandomAccessRange

Source: https://en.cppreference.com/w/cpp/experimental/ranges/range/RandomAccessRange

```cpp
// Defined in header <experimental/ranges/range>

template< class T >
concept bool RandomAccessRange =
    BidirectionalRange<T> &&
    RandomAccessIterator<ranges::iterator_t<T>>; // (ranges TS)
```

> Note: This section is incomplete Reason: add description and extra caveats
