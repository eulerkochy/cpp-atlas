# std::experimental::ranges::InputRange

Source: https://en.cppreference.com/w/cpp/experimental/ranges/range/InputRange

```cpp
// Defined in header <experimental/ranges/range>

template< class T >
concept bool InputRange =
    Range<T> && InputIterator<ranges::iterator_t<T>>; // (ranges TS)
```

> Note: This section is incomplete Reason: add description and extra caveats
