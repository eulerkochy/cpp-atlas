# std::experimental::ranges::BidirectionalRange

Source: https://en.cppreference.com/w/cpp/experimental/ranges/range/BidirectionalRange

```cpp
// Defined in header <experimental/ranges/range>

template< class T >
concept bool BidirectionalRange =
    ForwardRange<T> &&
    BidirectionalIterator<ranges::iterator_t<T>>; // (ranges TS)
```

> Note: This section is incomplete Reason: add description and extra caveats
