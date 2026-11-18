# std::tuple_size<std::experimental::ranges::tagged>

Source: https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged/tuple_size

```cpp
template< class Base, class... Tags >
struct tuple_size<std::experimental::ranges::tagged<Base, Tags...>>
    : std::tuple_size<Base> {}; // (ranges TS)
```

The partial specialization of `std::tuple_size` for `tagged` provides the ability to obtain the number of elements in a `tagged` object using tuple-like syntax. It simply forwards to `std::tuple_size<Base>`.

## Inherited from std::integral_constant

### Member constants

- `value` [static]: `std::tuple_size<Base>::value` (public static member constant)

### Member functions

- `operator std::size_t`: converts the object to `std::size_t`, returns `value` (public member function)
- `operator()` (C++14): returns `value` (public member function)

### Member types

**Type — Definition**

- `value_type`: `std::size_t`
- `type`: `std::integral_constant<std::size_t, value>`

### See also

- [`std::tuple_size<std::tuple>`](https://en.cppreference.com/w/cpp/utility/tuple/tuple_size) (C++11): obtains the size of a `tuple` (class template specialization)
- [`std::tuple_size<std::array>`](https://en.cppreference.com/w/cpp/container/array/tuple_size) (C++11): obtains the size of an `array` (class template specialization)
- [`std::tuple_size<std::pair>`](https://en.cppreference.com/w/cpp/utility/pair/tuple_size) (C++11): obtains the size of a `pair` (class template specialization)
- [`std::tuple_element<std::experimental::ranges::tagged>`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged/tuple_element): obtains the types of the elements of a `tagged` (class template specialization)
