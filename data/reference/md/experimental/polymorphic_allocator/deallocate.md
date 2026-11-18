# std::experimental::pmr::polymorphic_allocator<T>::deallocate

Source: https://en.cppreference.com/w/cpp/experimental/polymorphic_allocator/deallocate

```cpp
void deallocate( T* p, std::size_t n ); // (library fundamentals TS)
```

Deallocates the storage pointed to by `p`, which must have been allocated from a `memory_resource` `x` that compares equal to `*resource()` using `x.allocate(n * sizeof(T), alignof(T))`.

Equivalent to `this->resource()->deallocate(p, n * sizeof(T), alignof(T));`.

## Parameters

- `p` - pointer to memory to deallocate
- `n` - the number of objects originally allocated

## Exceptions

Throws nothing.

## See also

- [`deallocate`](https://en.cppreference.com/w/cpp/memory/allocator_traits/deallocate) [static]: deallocates storage using the allocator (public static member function of `std::allocator_traits<Alloc>`)
- [`deallocate`](https://en.cppreference.com/w/cpp/experimental/memory_resource/deallocate): deallocates memory (public member function of `std::experimental::pmr::memory_resource`)
