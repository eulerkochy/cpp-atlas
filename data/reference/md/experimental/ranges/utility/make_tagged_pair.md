# std::experimental::ranges::make_tagged_pair

Source: https://en.cppreference.com/w/cpp/experimental/ranges/utility/make_tagged_pair

```cpp
// Defined in header <experimental/ranges/utility>

template< TagSpecifier Tag1, TagSpecifier Tag2, class T1, class T2 >
constexpr ranges::tagged</*see below*/, Tag1, Tag2> make_tagged_pair( T1&& x, T2&& y ); // (ranges TS)
```

Convenience function for creating a tagged pair, deducing the element types from the arguments (the tag specifiers must be explicitly specified).

The *see below* portion of the return type is `decltype(std::make_pair(std::forward<T1>(x), std::forward<T2>(y)))`.

## Return value

`R(std::forward<T1>(x), std::forward<T2>(y))`, where `R` is the return type.

## See also

- [`TaggedType`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/TaggedType): specifies that a type represents a tag specifier and its element type (concept)
- [`tagged`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged): augument a tuple-like type with named accessors (class template)
- [`tagged_pair`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged_pair): alias template for a tagged `std::pair` (alias template)
- [`tagged_tuple`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged_tuple): alias template for a tagged `std::tuple` (alias template)
- [`make_tagged_tuple`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/make_tagged_tuple): convenience function for creating a `tagged_tuple` (function template)
- [`in`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`in1`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`in2`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`out`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`out1`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`out2`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`fun`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`min`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`max`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`begin`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`end`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags): tag specifiers for use with `ranges::tagged` (class)
