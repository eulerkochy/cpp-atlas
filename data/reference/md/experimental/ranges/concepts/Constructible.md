# std::experimental::ranges::Constructible

Source: https://en.cppreference.com/w/cpp/experimental/ranges/concepts/Constructible

```cpp
// Defined in header <experimental/ranges/concepts>

template< class T, class... Args >
concept bool Constructible =
    Destructible<T> && std::is_constructible<T, Args...>::value; // (ranges TS)
```

The `Constructible` concept specifies that a variable of type `T` can be initialized with the given set of argument types `Args...`.

There need not be any subsumption relationship between `Constructible<T, Args...>` and `std::is_constructible<T, Args...>::value`.

## See also

- [`is_constructible`](https://en.cppreference.com/w/cpp/types/is_constructible) (C++11), [`is_trivially_constructible`](https://en.cppreference.com/w/cpp/types/is_constructible) (C++11), [`is_nothrow_constructible`](https://en.cppreference.com/w/cpp/types/is_constructible) (C++11): checks if a type has a constructor for specific arguments (class template)
