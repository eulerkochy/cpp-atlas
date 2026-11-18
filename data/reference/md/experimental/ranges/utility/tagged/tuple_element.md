# std::tuple_element<std::experimental::ranges::tagged>

Source: https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged/tuple_element

```cpp
template< std::size_t N, class Base, class... Tags >
struct tuple_element<N, std::experimental::ranges::tagged<Base, Tags...>>
    : std::tuple_element<N, Base> {}; // (ranges TS)
```

The partial specialization of `std::tuple_element` for `tagged` provide compile-time access to the types of the `tagged`'s elements, using tuple-like syntax. It simply forwards to `std::tuple_element<N, Base>`.

## Member types

**Member type — Definition**

- `type`: `std::tuple_element_t<N, Base>`

## See also

- [`std::tuple_element<std::tuple>`](https://en.cppreference.com/w/cpp/utility/tuple/tuple_element) (C++11): obtains the type of the specified element (class template specialization)
- [`std::tuple_element<std::array>`](https://en.cppreference.com/w/cpp/container/array/tuple_element) (C++11): obtains the type of the elements of `array` (class template specialization)
- [`std::tuple_element<std::pair>`](https://en.cppreference.com/w/cpp/utility/pair/tuple_element) (C++11): obtains the type of the elements of `pair` (class template specialization)
- [`std::tuple_size<std::experimental::ranges::tagged>`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged/tuple_size): obtains the size of a `tagged` (class template specialization)
