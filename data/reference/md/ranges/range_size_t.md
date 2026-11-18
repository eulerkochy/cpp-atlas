# std::ranges::range_size_t, std::ranges::range_difference_t, std::ranges::range_value_t

Source: https://en.cppreference.com/w/cpp/ranges/range_size_t

```cpp
// Defined in header <ranges>

template< ranges::sized_range R >
using range_size_t = decltype(ranges::size(std::declval<R&>())); // (1) (since C++20)

template< ranges::range R >
using range_difference_t = std::iter_difference_t<ranges::iterator_t<R>>; // (2) (since C++20)

template< ranges::range R >
using range_value_t = std::iter_value_t<ranges::iterator_t<R>>; // (3) (since C++20)
```

1) Used to obtain the size type of the `sized_range` type `R`.

2) Used to obtain the difference type of the iterator type of range type `R`.

3) Used to obtain the value type of the iterator type of range type `R`.

## Template parameters

- `R` - a `range` type or a `sized_range` type

## See also

- [`iter_value_t`](https://en.cppreference.com/w/cpp/iterator/iter_t) (C++20), [`iter_reference_t`](https://en.cppreference.com/w/cpp/iterator/iter_t) (C++20), [`iter_const_reference_t`](https://en.cppreference.com/w/cpp/iterator/iter_t) (C++23), [`iter_difference_t`](https://en.cppreference.com/w/cpp/iterator/iter_t) (C++20), [`iter_rvalue_reference_t`](https://en.cppreference.com/w/cpp/iterator/iter_t) (C++20), [`iter_common_reference_t`](https://en.cppreference.com/w/cpp/iterator/iter_t) (C++20): computes the associated types of an iterator (alias template)
- [`ranges::iterator_t`](https://en.cppreference.com/w/cpp/ranges/iterator_t) (C++20), [`ranges::const_iterator_t`](https://en.cppreference.com/w/cpp/ranges/iterator_t) (C++23), [`ranges::sentinel_t`](https://en.cppreference.com/w/cpp/ranges/iterator_t) (C++20), [`ranges::const_sentinel_t`](https://en.cppreference.com/w/cpp/ranges/iterator_t) (C++23): obtains iterator and sentinel types of a range (alias template)
- [`ranges::range_reference_t`](https://en.cppreference.com/w/cpp/ranges/range_reference_t) (C++20), [`ranges::range_const_reference_t`](https://en.cppreference.com/w/cpp/ranges/range_reference_t) (C++23), [`ranges::range_rvalue_reference_t`](https://en.cppreference.com/w/cpp/ranges/range_reference_t) (C++20), [`ranges::range_common_reference_t`](https://en.cppreference.com/w/cpp/ranges/range_reference_t) (C++20): obtains reference types of a range (alias template)
