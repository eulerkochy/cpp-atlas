# std::experimental::ranges::tagged

Source: https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged

```cpp
// Defined in header <experimental/ranges/utility>

template< class Base, TagSpecifier... Tags >
    requires sizeof...(Tags) <= std::tuple_size<Base>::value
struct tagged; // (ranges TS)
```

The class template `tagged` augments a tuple-like class type `Base`, which it publicly derives from, with a set of named accessors specified by the tag specifiers `Tags...`. The tags are applied in order: the i-th tag specifier in `Tags...` correspond to the i-th element of the tuple.

The tag specifiers in `Tags...` shall be unique. Otherwise, the behavior is undefined.

It is not possible to delete an instance of `tagged` through a pointer to any base other than `Base`.

## Member functions

- (constructor): construct a `tagged` object (public member function)
- `operator=`: assigns a `tagged` object (public member function)
- `swap`: swaps the contents of two `tagged` objects (public member function)

### Named element accessors

For the *N*-th tag specifier in `Tags...` whose corresponding element name is *name*, `tagged` provides accessors named *name* as follows:

```cpp
constexpr decltype(auto) name() &       { return std::get<N>(*this); }
constexpr decltype(auto) name() const & { return std::get<N>(*this); }
constexpr decltype(auto) name() &&      { return std::get<N>(std::move(*this)); }
```

## Non-member functions

- `ranges::swap(ranges::tagged)`: specializes `swap` for `tagged` objects (function)

## Tuple-like access

- `std::tuple_size<std::experimental::ranges::tagged>`: obtains the size of a `tagged` (class template specialization)
- `std::tuple_element<std::experimental::ranges::tagged>`: obtains the types of the elements of a `tagged` (class template specialization)

## See also

- [`TagSpecifier`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/TagSpecifier): specifies that a type is a tag specifier (concept)
- [`tagged_pair`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged_pair): alias template for a tagged `std::pair` (alias template)
- [`make_tagged_pair`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/make_tagged_pair): convenience function for creating a `tagged_pair` (function template)
- [`tagged_tuple`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged_tuple): alias template for a tagged `std::tuple` (alias template)
- [`make_tagged_tuple`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/make_tagged_tuple): convenience function for creating a `tagged_tuple` (function template)
- [`in`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`in1`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`in2`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`out`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`out1`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`out2`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`fun`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`min`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`max`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`begin`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags), [`end`](https://en.cppreference.com/w/cpp/experimental/ranges/algorithm/tags): tag specifiers for use with `ranges::tagged` (class)
