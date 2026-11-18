# std::sorted_unique_t, std::sorted_unique

Source: https://en.cppreference.com/w/cpp/container/sorted_unique

```cpp
// Defined in header <flat_map>
// Defined in header <flat_set>
struct sorted_unique_t { explicit sorted_unique_t() = default; }; // (1) (since C++23)
inline constexpr sorted_unique_t sorted_unique{}; // (2) (since C++23)
```

1) The type `std::sorted_unique_t` can be used in the function's (including constructor's) parameter list to match the intended tag.

2) The corresponding `std::sorted_unique` instance of (1) is a disambiguation tag that can be passed to the functions of `std::flat_map` and `std::flat_set` to indicate that the input range or container is sorted (with respect to the comparator used in flat container adaptor) and all elements of such container or range are unique.

## Standard library

The following standard library container adaptors use (1,2) as disambiguation tags:

- `flat_map` (C++23): adapts two containers to provide a collection of key-value pairs, sorted by unique keys (class template)
- `flat_set` (C++23): adapts a container to provide a collection of unique keys, sorted by keys (class template)

## See also

- [`sorted_equivalent`](https://en.cppreference.com/w/cpp/container/sorted_equivalent) (C++23), [`sorted_equivalent_t`](https://en.cppreference.com/w/cpp/container/sorted_equivalent): indicates that elements of a range are sorted (uniqueness is not required) (tag)
- [`from_range_t`](https://en.cppreference.com/w/cpp/ranges/from_range) (C++23), [`from_range`](https://en.cppreference.com/w/cpp/ranges/from_range): from-range construction tag (tag)
- [`in_place`](https://en.cppreference.com/w/cpp/utility/in_place) (C++17), [`in_place_type`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_index`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_t`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_type_t`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_index_t`](https://en.cppreference.com/w/cpp/utility/in_place): in-place construction tag (tag)
