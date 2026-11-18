# std::experimental::pmr::synchronized_pool_resource::~synchronized_pool_resource

Source: https://en.cppreference.com/w/cpp/experimental/synchronized_pool_resource/~synchronized_pool_resource

```cpp
virtual ~synchronized_pool_resource(); // (library fundamentals TS)
```

Destroys a `synchronized_pool_resource`.

Deallocates all memory owned by this resource by calling `this->release()`.

## See also

- [`release`](https://en.cppreference.com/w/cpp/experimental/synchronized_pool_resource/release): release all allocated memory (public member function)
