# std::experimental::vector_aligned_tag, std::experimental::vector_aligned

Source: https://en.cppreference.com/w/cpp/experimental/simd/vector_aligned

```cpp
// Defined in header <experimental/simd>

struct vector_aligned_tag {};
inline constexpr vector_aligned_tag vector_aligned{}; // (parallelism TS v2)
```

This tag type indicates that the buffer of `copy_from` and `copy_to` is aligned to `memory_alignment_v<T, U>`, where the copy operation operates on the `simd`/`simd_mask` type T, and the buffer with element type U.

## Notes

This tag type allows to implement vector-aligned load and store.

## See also

- [`element_aligned_tag`](https://en.cppreference.com/w/cpp/experimental/simd/element_aligned) (parallelism TS v2), [`element_aligned`](https://en.cppreference.com/w/cpp/experimental/simd/element_aligned): flag indicating alignment of the load/store address to element alignment (class)
- [`overaligned_tag`](https://en.cppreference.com/w/cpp/experimental/simd/overaligned) (parallelism TS v2), [`overaligned`](https://en.cppreference.com/w/cpp/experimental/simd/overaligned): flag indicating alignment of the load/store address to the specified alignment (class template)
- [`memory_alignment`](https://en.cppreference.com/w/cpp/experimental/simd/memory_alignment) (parallelism TS v2): obtains an appropriate alignment for `vector_aligned` (class template)
