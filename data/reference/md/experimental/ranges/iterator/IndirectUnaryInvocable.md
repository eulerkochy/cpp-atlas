# std::experimental::ranges::IndirectUnaryInvocable, std::experimental::ranges::IndirectRegularUnaryInvocable

Source: https://en.cppreference.com/w/cpp/experimental/ranges/iterator/IndirectUnaryInvocable

```cpp
// Defined in header <experimental/ranges/iterator>

template< class F, class I >
concept bool IndirectUnaryInvocable =
    Readable<I> && CopyConstructible<F> &&
    Invocable<F&, ranges::value_type_t<I>&> &&
    Invocable<F&, ranges::reference_t<I>> &&
    Invocable<F&, ranges::iter_common_reference_t<I>> &&
    CommonReference<
        std::result_of_t<F&(ranges::value_type_t<I>&)>,
        std::result_of_t<F&(ranges::reference_t<I>&&)>>; // (ranges TS)

template< class F, class I >
concept bool IndirectRegularUnaryInvocable =
    Readable<I> && CopyConstructible<F> &&
    RegularInvocable<F&, ranges::value_type_t<I>&> &&
    RegularInvocable<F&, ranges::reference_t<I>> &&
    RegularInvocable<F&, ranges::iter_common_reference_t<I>> &&
    CommonReference<
        std::result_of_t<F&(ranges::value_type_t<I>&)>,
        std::result_of_t<F&(ranges::reference_t<I>&&)>>; // (ranges TS)
```

> Note: This section is incomplete Reason: add description and extra caveats
