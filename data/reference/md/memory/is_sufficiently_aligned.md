# std::is_sufficiently_aligned

Source: https://en.cppreference.com/w/cpp/memory/is_sufficiently_aligned

```cpp
// Defined in header <memory>

template< std::size_t N, class T >
bool is_sufficiently_aligned( T* ptr ); // (since C++26)
```

Checks whether the pointer `ptr` points to an object whose alignment has a value of at least `N`.

The behavior is undefined if `ptr` does not point to an object of type `T` (ignoring cv-qualification at every level).

## Return value

`true` if `ptr` points to an object that has alignment at least `N`; otherwise `false`.

## Exceptions

Throws nothing.

## Notes

`std::is_sufficiently_aligned` can be used as a precondition to `std::assume_aligned`.

| Feature-test macro | Value | Std | Feature |
| --- | --- | --- | --- |
| `__cpp_lib_is_sufficiently_aligned` | `202411L` | (C++26) | `std::is_sufficiently_aligned` |

## Possible implementation

```cpp
template<std::size_t N, class T>
bool is_sufficiently_aligned(T* ptr)
{
    return std::bit_cast<std::uintptr_t>(ptr) % N == 0;
}
```

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`alignof` (C++11)](https://en.cppreference.com/w/cpp/language/alignof): queries alignment requirements of a type (operator)
- [`alignas` (C++11)](https://en.cppreference.com/w/cpp/language/alignas): specifies that the storage for the variable should be aligned by specific amount (specifier)
- [`aligned_storage`](https://en.cppreference.com/w/cpp/types/aligned_storage) (since C++11): defines the type suitable for use as uninitialized storage for types of given size (class template)
- [`align`](https://en.cppreference.com/w/cpp/memory/align) (C++11): aligns a pointer in a buffer (function)
- `aligned_accessor` (C++26): a type for aligned access to elements of `mdspan` (class template)
