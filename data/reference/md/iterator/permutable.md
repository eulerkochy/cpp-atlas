# std::permutable

Source: https://en.cppreference.com/w/cpp/iterator/permutable

```cpp
// Defined in header <iterator>

template< class I >
concept permutable =
    std::forward_iterator<I> &&
    std::indirectly_movable_storable<I, I> &&
    std::indirectly_swappable<I, I>; // (since C++20)
```

The concept `permutable` refines `std::forward_iterator` by adding requirements for reordering through moves and swaps.

## Semantic requirements

`I` models `permutable` only if all concepts it subsumes are modeled.

## See also

- [`sortable`](https://en.cppreference.com/w/cpp/iterator/sortable) (C++20): specifies the common requirements of algorithms that permute sequences into ordered sequences (concept)
- [`ranges::remove`](https://en.cppreference.com/w/cpp/algorithm/ranges/remove) (C++20), [`ranges::remove_if`](https://en.cppreference.com/w/cpp/algorithm/ranges/remove) (C++20): removes elements satisfying specific criteria (algorithm function object)
- [`ranges::unique`](https://en.cppreference.com/w/cpp/algorithm/ranges/unique) (C++20): removes consecutive duplicate elements in a range (algorithm function object)
- [`ranges::reverse`](https://en.cppreference.com/w/cpp/algorithm/ranges/reverse) (C++20): reverses the order of elements in a range (algorithm function object)
- [`ranges::rotate`](https://en.cppreference.com/w/cpp/algorithm/ranges/rotate) (C++20): rotates the order of elements in a range (algorithm function object)
- [`ranges::shuffle`](https://en.cppreference.com/w/cpp/algorithm/ranges/shuffle) (C++20): randomly re-orders elements in a range (algorithm function object)
- [`ranges::partition`](https://en.cppreference.com/w/cpp/algorithm/ranges/partition) (C++20): divides a range of elements into two groups (algorithm function object)
- [`ranges::stable_partition`](https://en.cppreference.com/w/cpp/algorithm/ranges/stable_partition) (C++20): divides elements into two groups while preserving their relative order (algorithm function object)
