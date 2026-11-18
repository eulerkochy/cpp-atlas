# std::experimental::pmr::unsynchronized_pool_resource::~unsynchronized_pool_resource

Source: https://en.cppreference.com/w/cpp/experimental/unsynchronized_pool_resource/~unsynchronized_pool_resource

```cpp
virtual ~unsynchronized_pool_resource(); // (library fundamentals TS)
```

Destroys a `unsynchronized_pool_resource`.

Deallocates all memory owned by this resource by calling `this->release()`.

## See also

- [`release`](https://en.cppreference.com/w/cpp/experimental/unsynchronized_pool_resource/release): release all allocated memory (public member function)
