# std::experimental::simd<T,Abi>::copy_to

Source: https://en.cppreference.com/w/cpp/experimental/simd/simd/copy_to

```cpp
template< class U, class Flags >
void copy_to( U* mem, Flags flags ); // (parallelism TS v2)
```

The store function copies all elements of a `simd` such that the i-th element is converted to `U` and subsequently written to `mem[i]` for all i in the range of `[​0​,` `size())`.

## Parameters

- `mem` - a pointer into an array where `[mem,` `mem + size())` is a valid range
- `flags` - if of type `vector_aligned_tag`, the load constructor may assume `mem` to point to storage aligned by `memory_alignment_v<simd, U>`

**Type requirements**

- `U` must be a *vectorizable* type.
- `is_simd_flag_type_v<Flags>` must be `true`.

## Example

```cpp
#include <experimental/simd>
#include <iostream>
namespace stdx = std::experimental;

int main()
{
    alignas(stdx::memory_alignment_v<stdx::native_simd<int>>)
        std::array<int, stdx::native_simd<int>::size()> mem = {};

    stdx::native_simd<int> a = 7;
    a.copy_to(&mem[0], stdx::vector_aligned);

    for (int e : mem)
        std::cout << e << ' ';
    std::cout << '\n';
}
```

Possible output:

```text
7 7 7 7 7 7 7 7 7 7 7 7 7 7 7 7
```

## See also

- [`element_aligned_tag`](https://en.cppreference.com/w/cpp/experimental/simd/element_aligned) (parallelism TS v2), [`element_aligned`](https://en.cppreference.com/w/cpp/experimental/simd/element_aligned): flag indicating alignment of the load/store address to element alignment (class)
- [`vector_aligned_tag`](https://en.cppreference.com/w/cpp/experimental/simd/vector_aligned) (parallelism TS v2), [`vector_aligned`](https://en.cppreference.com/w/cpp/experimental/simd/vector_aligned): flag indicating alignment of the load/store address to vector alignment (class)
- [`overaligned_tag`](https://en.cppreference.com/w/cpp/experimental/simd/overaligned) (parallelism TS v2), [`overaligned`](https://en.cppreference.com/w/cpp/experimental/simd/overaligned): flag indicating alignment of the load/store address to the specified alignment (class template)
- [`memory_alignment`](https://en.cppreference.com/w/cpp/experimental/simd/memory_alignment) (parallelism TS v2): obtains an appropriate alignment for `vector_aligned` (class template)
- [`copy_from`](https://en.cppreference.com/w/cpp/experimental/simd/simd/copy_from) (parallelism TS v2): loads `simd` elements from contiguous memory (public member function)
