# std::experimental::pmr::monotonic_buffer_resource::do_deallocate

Source: https://en.cppreference.com/w/cpp/experimental/monotonic_buffer_resource/do_deallocate

```cpp
virtual void do_deallocate( void* p, std::size_t bytes, std::size_t alignment ); // (library fundamentals TS)
```

This function has no effect. Memory used by a `monotonic_buffer_resource`, as its name indicates, increases monotonically until the resource is destroyed.

## Exceptions

Throws nothing.

## See also

- [`deallocate`](https://en.cppreference.com/w/cpp/experimental/memory_resource/deallocate): deallocates memory (public member function of `std::experimental::pmr::memory_resource`)
- [`do_deallocate`](https://en.cppreference.com/w/cpp/experimental/memory_resource/do_deallocate) [virtual]: deallocates memory (virtual protected member function of `std::experimental::pmr::memory_resource`)
