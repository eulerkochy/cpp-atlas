# std::experimental::pmr::unsynchronized_pool_resource::upstream_resource

Source: https://en.cppreference.com/w/cpp/experimental/unsynchronized_pool_resource/upstream_resource

```cpp
memory_resource* upstream_resource() const; // (library fundamentals TS)
```

Returns a pointer to the upstream memory resource. This is the same value as the `upstream` argument passed to the constructor of this object.

## See also

- [(constructor)](https://en.cppreference.com/w/cpp/experimental/unsynchronized_pool_resource/unsynchronized_pool_resource): constructs an `unsynchronized_pool_resource` (public member function)
