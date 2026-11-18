# std::sorted_equivalent_t, std::sorted_equivalent

Source: https://en.cppreference.com/w/cpp/container/sorted_equivalent

```cpp
// Defined in header <flat_map>
// Defined in header <flat_set>
struct sorted_equivalent_t { explicit sorted_equivalent_t() = default; }; // (1) (since C++23)
inline constexpr sorted_equivalent_t sorted_equivalent{}; // (2) (since C++23)
```

1) The type `std::sorted_equivalent_t` can be used in the function's (including constructor's) parameter list to match the intended tag.

2) The corresponding `std::sorted_equivalent` instance of (1) is a disambiguation tag that can be passed to the functions of `std::flat_multimap` and `std::flat_multiset` to indicate that the input range or container is sorted (with respect to the comparator used in flat container adaptor), whilst uniqueness of elements is not required.

## Standard library

The following standard library container adaptors use (1,2) as disambiguation tags:

- `flat_multimap` (C++23): adapts two containers to provide a collection of key-value pairs, sorted by keys (class template)
- `flat_multiset` (C++23): adapts a container to provide a collection of keys, sorted by keys (class template)

## See also

- [`sorted_unique`](https://en.cppreference.com/w/cpp/container/sorted_unique) (C++23), [`sorted_unique_t`](https://en.cppreference.com/w/cpp/container/sorted_unique): indicates that elements of a range are sorted and unique (tag)
- [`from_range_t`](https://en.cppreference.com/w/cpp/ranges/from_range) (C++23), [`from_range`](https://en.cppreference.com/w/cpp/ranges/from_range): from-range construction tag (tag)
- [`in_place`](https://en.cppreference.com/w/cpp/utility/in_place) (C++17), [`in_place_type`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_index`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_t`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_type_t`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_index_t`](https://en.cppreference.com/w/cpp/utility/in_place): in-place construction tag (tag)
