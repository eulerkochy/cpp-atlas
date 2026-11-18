# std::experimental::ranges::OutputRange

Source: https://en.cppreference.com/w/cpp/experimental/ranges/range/OutputRange

```cpp
// Defined in header <experimental/ranges/range>

template< class R, class T >
concept bool OutputRange =
    Range<R> && OutputIterator<ranges::iterator_t<R>, T>; // (ranges TS)
```

> Note: This section is incomplete Reason: add description and extra caveats
