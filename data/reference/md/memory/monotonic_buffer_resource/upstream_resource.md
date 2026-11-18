# std::pmr::monotonic_buffer_resource::upstream_resource

Source: https://en.cppreference.com/w/cpp/memory/monotonic_buffer_resource/upstream_resource

```cpp
std::pmr::memory_resource* upstream_resource() const; // (since C++17)
```

Returns a pointer to the upstream memory resource. This is the same value as the `upstream` argument passed to the constructor of this object.

## See also

- [(constructor)](https://en.cppreference.com/w/cpp/memory/monotonic_buffer_resource/monotonic_buffer_resource): constructs a `monotonic_buffer_resource` (public member function)
