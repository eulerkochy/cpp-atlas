# std::experimental::ranges::Permutable

Source: https://en.cppreference.com/w/cpp/experimental/ranges/iterator/Permutable

```cpp
template< class I >
concept bool Permutable =
    ForwardIterator<I> &&
    IndirectlyMovableStorable<I, I> &&
    IndirectlySwappable<I, I>; // (ranges TS)
```

The `Permutable` concept specifies the common requirements of algorithms that reorder elements in place by moving or swapping them (for example, `ranges::rotate`).
