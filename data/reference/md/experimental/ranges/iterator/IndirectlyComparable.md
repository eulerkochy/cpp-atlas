# std::experimental::ranges::IndirectlyComparable

Source: https://en.cppreference.com/w/cpp/experimental/ranges/iterator/IndirectlyComparable

```cpp
// Defined in header <experimental/ranges/iterator>

template< class I1, class I2, class R = ranges::equal_to<>,
          class P1 = ranges::identity, class P2 = ranges::identity >
concept bool IndirectlyComparable =
    IndirectRelation<R, ranges::projected<I1, P1>, ranges::projected<I2, P2>>; // (ranges TS)
```

> Note: This section is incomplete Reason: add description and extra caveats
