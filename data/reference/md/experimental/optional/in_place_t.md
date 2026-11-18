# std::experimental::in_place_t

Source: https://en.cppreference.com/w/cpp/experimental/optional/in_place_t

```cpp
// Defined in header <experimental/optional>
struct in_place_t {}; // (library fundamentals TS)
```

`std::experimental::in_place_t` is an empty class type used to disambiguate the overloads of constructors and member functions of that take arguments (possibly a parameter pack) for in-place construction of some value.

## See also

- [`in_place`](https://en.cppreference.com/w/cpp/utility/in_place) (C++17), [`in_place_type`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_index`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_t`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_type_t`](https://en.cppreference.com/w/cpp/utility/in_place), [`in_place_index_t`](https://en.cppreference.com/w/cpp/utility/in_place): in-place construction tag (tag)
- [`optional`](https://en.cppreference.com/w/cpp/utility/optional) (C++17): a wrapper that may or may not hold an object (class template)
