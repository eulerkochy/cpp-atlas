# std::experimental::pmr::monotonic_buffer_resource::release

Source: https://en.cppreference.com/w/cpp/experimental/monotonic_buffer_resource/release

```cpp
void release(); // (library fundamentals TS)
```

Releases all allocated memory by calling the `deallocate` function on the upstream memory resource as necessary.

Memory is released back to the upstream resource even if `deallocate` has not been called for some of the allocated blocks.

## See also

- [`deallocate`](https://en.cppreference.com/w/cpp/experimental/memory_resource/deallocate): deallocates memory (public member function of `std::experimental::pmr::memory_resource`)
