# std::unexpect_t, std::unexpect

Source: https://en.cppreference.com/w/cpp/utility/expected/unexpect_t

```cpp
// Defined in header <expected>
struct unexpect_t { explicit unexpect_t() = default; }; // (1) (since C++23)
inline constexpr std::unexpect_t unexpect{}; // (2) (since C++23)
```

1) A tag type for in-place construction of an unexpected value in an `std::expected` object.

2) A constant of type `const std::unexpect_t` which is usually directly passed to a constructor of `std::expected` to construct an unexpected value.

## Notes

Like other construction tag types, `unexpect_t` is a trivial, empty class with an explicit default constructor.

## See also

- [(constructor)](https://en.cppreference.com/w/cpp/utility/expected/expected): constructs the `expected` object (public member function)
- [`in_place`](https://en.cppreference.com/w/cpp/utility/in_place) (C++17), [`in_place_type`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_index`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_t`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_type_t`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_index_t`](https://en.cppreference.com/w/cpp/utility/in_place): in-place construction tag (tag)
