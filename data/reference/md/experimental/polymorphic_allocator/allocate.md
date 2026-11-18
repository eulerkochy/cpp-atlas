# std::experimental::pmr::polymorphic_allocator<T>::allocate

Source: https://en.cppreference.com/w/cpp/experimental/polymorphic_allocator/allocate

```cpp
T* allocate( std::size_t n ); // (library fundamentals TS)
```

Allocates storage for `n` objects of type `T` using the underlying memory resource. Equivalent to

`return static_cast<T*>(this->resource()->allocate(n * sizeof(T), alignof(T)));`.

## Parameters

- `n` - the number of objects to allocate storage for

## Return value

A pointer to the allocated storage.

## See also

- [`allocate`](https://en.cppreference.com/w/cpp/memory/allocator_traits/allocate) [static]: allocates uninitialized storage using the allocator (public static member function of `std::allocator_traits<Alloc>`)
- [`deallocate`](https://en.cppreference.com/w/cpp/experimental/memory_resource/deallocate): deallocates memory (public member function of `std::experimental::pmr::memory_resource`)
