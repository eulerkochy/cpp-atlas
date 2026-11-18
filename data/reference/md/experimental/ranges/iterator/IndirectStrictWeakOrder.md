# std::experimental::ranges::IndirectStrictWeakOrder

Source: https://en.cppreference.com/w/cpp/experimental/ranges/iterator/IndirectStrictWeakOrder

```cpp
// Defined in header <experimental/ranges/iterator>

template< class F, class I1, class I2 = I1 >
concept bool IndirectStrictWeakOrder =
    Readable<I1> && Readable<I2> &&
    CopyConstructible<F> &&
    StrictWeakOrder<F&, ranges::value_type_t<I1>&, ranges::value_type_t<I2>&> &&
    StrictWeakOrder<F&, ranges::value_type_t<I1>&, ranges::reference_t<I2>> &&
    StrictWeakOrder<F&, ranges::reference_t<I1>, ranges::value_type_t<I2>&> &&
    StrictWeakOrder<F&, ranges::reference_t<I1>, ranges::reference_t<I2>> &&
    StrictWeakOrder<F&, ranges::iter_common_reference_t<I1>,
                        ranges::iter_common_reference_t<I2>>; // (ranges TS)
```

> Note: This section is incomplete Reason: add description and extra caveats
