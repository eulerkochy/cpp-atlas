# std::experimental::pmr::synchronized_pool_resource::release

Source: https://en.cppreference.com/w/cpp/experimental/synchronized_pool_resource/release

```cpp
void release(); // (library fundamentals TS)
```

Releases all memory owned by this resource by calling the `deallocate` function of the upstream memory resource as needed.

Memory is released back to the upstream resource even if `deallocate` has not been called for some of the allocated blocks.

## See also

- [`deallocate`](https://en.cppreference.com/w/cpp/experimental/memory_resource/deallocate): deallocates memory (public member function of `std::experimental::pmr::memory_resource`)
