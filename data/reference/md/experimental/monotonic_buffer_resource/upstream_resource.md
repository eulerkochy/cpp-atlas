# std::experimental::pmr::monotonic_buffer_resource::upstream_resource

Source: https://en.cppreference.com/w/cpp/experimental/monotonic_buffer_resource/upstream_resource

```cpp
memory_resource* upstream_resource() const; // (library fundamentals TS)
```

Returns a pointer to the upstream memory resource. This is the same value as the `upstream` argument passed to the constructor of this object.

## See also

- [(constructor)](https://en.cppreference.com/w/cpp/experimental/monotonic_buffer_resource/monotonic_buffer_resource): constructs a `monotonic_buffer_resource` (public member function)
