# std::experimental::simd_abi::scalar

Source: https://en.cppreference.com/w/cpp/experimental/simd/scalar

```cpp
// Defined in header <experimental/simd>
using scalar = /*unspecified*/; // (parallelism TS v2)
```

With the `scalar` ABI tag, data-parallel types are equivalent to a single element type. However, the full `simd` and `simd_mask` interface is supported and thus eases development of generic code.

## Notes

`scalar` is *not* an alias to `fixed_size<1>`.

## See also

- [`fixed_size`](https://en.cppreference.com/w/cpp/experimental/simd/fixed_size) (parallelism TS v2): tag type for storing specified number of elements (alias template)
- [`compatible`](https://en.cppreference.com/w/cpp/experimental/simd/compatible) (parallelism TS v2): tag type that ensures ABI compatibility (alias template)
- [`native`](https://en.cppreference.com/w/cpp/experimental/simd/native) (parallelism TS v2): tag type that is most efficient (alias template)
- [`deduce`](https://en.cppreference.com/w/cpp/experimental/simd/deduce) (parallelism TS v2), [`deduce_t`](https://en.cppreference.com/w/cpp/experimental/simd/deduce): obtains an ABI type for given element type and number of elements (class template)
