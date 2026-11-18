# std::experimental::ranges::tagged<Base,Tags...>::swap

Source: https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged/swap

```cpp
constexpr void swap( tagged& rhs ) noexcept(/* see below */)
    requires Swappable<Base>;
```

Swap the contents of `*this` and `rhs`, as if by `ranges::swap(static_cast<Base&>(*this), static_cast<Base&>(rhs));`.

## Exceptions

`noexcept` specification:

`noexcept(noexcept(ranges::swap(std::declval<Base&>(), std::declval<Base&>())))`

## See also

- [`ranges::swap(ranges::tagged)`](https://en.cppreference.com/w/cpp/experimental/ranges/utility/tagged/swap2): specializes `swap` for `tagged` objects (function)
