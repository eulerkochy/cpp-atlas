# std::experimental::simd_abi::compatible

Source: https://en.cppreference.com/w/cpp/experimental/simd/compatible

```cpp
// Defined in header <experimental/simd>

template< class T >
using compatible = /*implementation-defined*/; // (parallelism TS v2)
```

`compatible<T>` is an implementation-defined alias for an ABI tag.

## Notes

The intent is to use the ABI tag producing the most efficient data-parallel execution for the element type T that ensures ABI compatibility between translation units on the target architecture.

## See also

- [`scalar`](https://en.cppreference.com/w/cpp/experimental/simd/scalar) (parallelism TS v2): tag type for storing a single element (typedef)
- [`fixed_size`](https://en.cppreference.com/w/cpp/experimental/simd/fixed_size) (parallelism TS v2): tag type for storing specified number of elements (alias template)
- [`native`](https://en.cppreference.com/w/cpp/experimental/simd/native) (parallelism TS v2): tag type that is most efficient (alias template)
- [`deduce`](https://en.cppreference.com/w/cpp/experimental/simd/deduce) (parallelism TS v2), [`deduce_t`](https://en.cppreference.com/w/cpp/experimental/simd/deduce): obtains an ABI type for given element type and number of elements (class template)
