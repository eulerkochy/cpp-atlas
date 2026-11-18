# std::experimental::ranges::TagSpecifier

Source: https://en.cppreference.com/w/cpp/experimental/ranges/utility/TagSpecifier

```cpp
// Defined in header <experimental/ranges/utility>

template< class T >
concept bool TagSpecifier = /* implementation-defined */; // (ranges TS)
```

The concept `TagSpecifier<T>` is satisfied if and only if `T` is a tag specifier for use with `ranges::tagged`.

The Ranges TS provides a set of tag specifiers in `<experimental/ranges/algorithm>`. Users cannot define their own tag specifiers.

## See also

- [`tagged`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged): augument a tuple-like type with named accessors (class template)
- [`in`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`in1`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`in2`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`out`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`out1`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`out2`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`fun`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`min`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`max`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`begin`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`end`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags): tag specifiers for use with `ranges::tagged` (class)
