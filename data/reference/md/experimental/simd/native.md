# std::experimental::simd_abi::native

Source: https://en.cppreference.com/w/cpp/experimental/simd/native

```cpp
// Defined in header <experimental/simd>

template< class T >
using native = /*implementation-defined*/; // (parallelism TS v2)
```

`native<T>` is an implementation-defined alias for an ABI tag. This is the primary ABI tag to use for efficient explicit vectorization.

## Notes

The intent is to use the ABI tag producing the most efficient data-parallel execution for the element type T that is supported on the currently targeted system. For target architectures without ISA extensions, the `native<T>` and `compatible<T>` aliases will likely be the same. For target architectures with ISA extensions, compiler flags may influence the `native<T>` alias while `compatible<T>` will be the same independent of such flags.

## See also

- [`scalar`](https://en.cppreference.com/w/cpp/experimental/simd/scalar) (parallelism TS v2): tag type for storing a single element (typedef)
- [`fixed_size`](https://en.cppreference.com/w/cpp/experimental/simd/fixed_size) (parallelism TS v2): tag type for storing specified number of elements (alias template)
- [`compatible`](https://en.cppreference.com/w/cpp/experimental/simd/compatible) (parallelism TS v2): tag type that ensures ABI compatibility (alias template)
- [`deduce`](https://en.cppreference.com/w/cpp/experimental/simd/deduce) (parallelism TS v2), [`deduce_t`](https://en.cppreference.com/w/cpp/experimental/simd/deduce): obtains an ABI type for given element type and number of elements (class template)
