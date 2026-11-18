# std::experimental::ranges::IndirectlyCopyable

Source: https://en.cppreference.com/w/cpp/experimental/ranges/iterator/IndirectlyCopyable

```cpp
// Defined in header <experimental/ranges/iterator>

template< class In, class Out >
concept bool IndirectlyCopyable =
    Readable<In> && Writable<Out, ranges::reference_t<In>>; // (ranges TS)
```

> Note: This section is incomplete Reason: add description and extra caveats
