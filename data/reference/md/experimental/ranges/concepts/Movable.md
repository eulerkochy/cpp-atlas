# std::experimental::ranges::Movable

Source: https://en.cppreference.com/w/cpp/experimental/ranges/concepts/Movable

```cpp
// Defined in header <experimental/ranges/concepts>

template< class T >
concept bool Movable =
    std::is_object<T>::value &&
    MoveConstructible<T> &&
    Assignable<T&, T> &&
    Swappable<T>; // (ranges TS)
```

The concept `Movable<T>` specifies that `T` is an object type that can moved (that is, it can be move constructed, move assigned, and lvalues of type `T` can be swapped).

There need not be any subsumption relationship between `Movable<T>` and `std::is_object<T>::value`.

## See also

- [`Copyable`](https://en.cppreference.com/w/cpp/experimental/ranges/concepts/Copyable): specifies that an object of a type can be copied, moved, and swapped (concept)
