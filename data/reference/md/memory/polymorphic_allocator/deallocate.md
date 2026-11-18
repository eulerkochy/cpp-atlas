# std::pmr::polymorphic_allocator<T>::deallocate

Source: https://en.cppreference.com/w/cpp/memory/polymorphic_allocator/deallocate

```cpp
void deallocate( T* p, std::size_t n ); // (since C++17)
```

Deallocates the storage pointed to by `p`, which must have been allocated from a `std::pmr::memory_resource` `x` that compares equal to `*resource()` using `x.allocate(n * sizeof(T), alignof(T))`.

Equivalent to `this->resource()->deallocate(p, n * sizeof(T), alignof(T));`.

## Parameters

- `p` - pointer to memory to deallocate
- `n` - the number of objects originally allocated

## Exceptions

Throws nothing.

## See also

- [`deallocate_bytes`](https://en.cppreference.com/w/cpp/memory/polymorphic_allocator/deallocate_bytes) (C++20): free raw memory obtained from `allocate_bytes` (public member function)
- [`deallocate_object`](https://en.cppreference.com/w/cpp/memory/polymorphic_allocator/deallocate_object) (C++20): frees raw memory obtained by `allocate_object` (public member function)
- [`delete_object`](https://en.cppreference.com/w/cpp/memory/polymorphic_allocator/delete_object) (C++20): destroys and deallocates an object (public member function)
- [`deallocate`](https://en.cppreference.com/w/cpp/memory/allocator_traits/deallocate) [static]: deallocates storage using the allocator (public static member function of `std::allocator_traits<Alloc>`)
- [`deallocate`](https://en.cppreference.com/w/cpp/memory/memory_resource/deallocate): deallocates memory (public member function of `std::pmr::memory_resource`)
