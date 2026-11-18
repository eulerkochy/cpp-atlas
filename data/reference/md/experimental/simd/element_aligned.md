# std::experimental::element_aligned_tag, std::experimental::element_aligned

Source: https://en.cppreference.com/w/cpp/experimental/simd/element_aligned

```cpp
// Defined in header <experimental/simd>

struct element_aligned_tag {};
inline constexpr element_aligned_tag element_aligned{}; // (parallelism TS v2)
```

This tag type indicates that the buffer of `copy_from` and `copy_to` is aligned to its element alignment.

## See also

- [`vector_aligned_tag`](https://en.cppreference.com/w/cpp/experimental/simd/vector_aligned) (parallelism TS v2), [`vector_aligned`](https://en.cppreference.com/w/cpp/experimental/simd/vector_aligned): flag indicating alignment of the load/store address to vector alignment (class)
- [`overaligned_tag`](https://en.cppreference.com/w/cpp/experimental/simd/overaligned) (parallelism TS v2), [`overaligned`](https://en.cppreference.com/w/cpp/experimental/simd/overaligned): flag indicating alignment of the load/store address to the specified alignment (class template)
