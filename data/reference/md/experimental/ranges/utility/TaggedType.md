# std::experimental::ranges::TaggedType

Source: https://en.cppreference.com/w/cpp/experimental/ranges/utility/TaggedType

```cpp
// Defined in header <experimental/ranges/utility>

template< class T >
concept bool TaggedType = /* implementation-defined */; // (ranges TS)
```

The concept `TaggedType<T>` is satisfied if and only if `T` is a unary function type of the form `R(A)`, where `R` is a `TagSpecifier`.

Such types are used with the convenience alias templates `tagged_tuple` and `tagged_pair`.

## See also

- [`tagged_tuple`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged_tuple): alias template for a tagged `std::tuple` (alias template)
- [`tagged_pair`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged_pair): alias template for a tagged `std::pair` (alias template)
- [`in`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`in1`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`in2`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`out`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`out1`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`out2`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`fun`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`min`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`max`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`begin`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`end`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags): tag specifiers for use with `ranges::tagged` (class)
