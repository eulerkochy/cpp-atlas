# std::ranges::range_reference_t, std::ranges::range_const_reference_t, std::ranges::range_rvalue_reference_t, std::ranges::range_common_reference_t

Source: https://en.cppreference.com/w/cpp/ranges/range_reference_t

```cpp
// Defined in header <ranges>

template< ranges::range R >
using range_reference_t = std::iter_reference_t<ranges::iterator_t<R>>; // (1) (since C++20)

template< ranges::range R >
using range_const_reference_t =
    std::iter_const_reference_t<ranges::iterator_t<R>>; // (2) (since C++23)

template< ranges::range R >
using range_rvalue_reference_t =
    std::iter_rvalue_reference_t<ranges::iterator_t<R>>; // (3) (since C++20)

template< ranges::range R >
using range_common_reference_t =
    std::iter_common_reference_t<ranges::iterator_t<R>>; // (4) (since C++20)
```

1) Used to obtain the reference type of the iterator type of range type `R`.

2) Used to obtain the constant reference type of the iterator type of range type `R`.

3) Used to obtain the rvalue reference type of the iterator type of range type `R`.

4) Used to obtain the common reference type of the iterator type of range type `R`.

## Template parameters

- `R` - a `range` type or a `sized_range` type

## Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| LWG 3860 | C++20 | `range_common_reference_t` was missing | added |

## See also

- [`iter_value_t`](https://en.cppreference.com/w/cpp/iterator/iter_t) (C++20), [`iter_reference_t`](https://en.cppreference.com/w/cpp/iterator/iter_t) (C++20), [`iter_const_reference_t`](https://en.cppreference.com/w/cpp/iterator/iter_t) (C++23), [`iter_difference_t`](https://en.cppreference.com/w/cpp/iterator/iter_t) (C++20), [`iter_rvalue_reference_t`](https://en.cppreference.com/w/cpp/iterator/iter_t) (C++20), [`iter_common_reference_t`](https://en.cppreference.com/w/cpp/iterator/iter_t) (C++20): computes the associated types of an iterator (alias template)
- [`ranges::iterator_t`](https://en.cppreference.com/w/cpp/ranges/iterator_t) (C++20), [`ranges::const_iterator_t`](https://en.cppreference.com/w/cpp/ranges/iterator_t) (C++23), [`ranges::sentinel_t`](https://en.cppreference.com/w/cpp/ranges/iterator_t) (C++20), [`ranges::const_sentinel_t`](https://en.cppreference.com/w/cpp/ranges/iterator_t) (C++23): obtains iterator and sentinel types of a range (alias template)
- [`ranges::range_difference_t`](https://en.cppreference.com/w/cpp/ranges/range_size_t) (C++20), [`ranges::range_size_t`](https://en.cppreference.com/w/cpp/ranges/range_size_t) (C++20), [`ranges::range_value_t`](https://en.cppreference.com/w/cpp/ranges/range_size_t) (C++20): obtains size, difference, and value types of a range (alias template)
