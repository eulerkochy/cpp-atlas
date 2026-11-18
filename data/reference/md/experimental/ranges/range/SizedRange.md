# std::experimental::ranges::SizedRange

Source: https://en.cppreference.com/w/cpp/experimental/ranges/range/SizedRange

```cpp
// Defined in header <experimental/ranges/range>

template< class T >
concept bool SizedRange =
    Range<T> &&
    !ranges::disable_sized_range<std::remove_cv_t<std::remove_reference_t<T>>> &&
    requires(T& t) {
        { ranges::size(t) }
            -> ConvertibleTo<ranges::difference_type_t<ranges::iterator_t<T>>>;
    }; // (ranges TS)
```

> Note: This section is incomplete Reason: add description and extra caveats
