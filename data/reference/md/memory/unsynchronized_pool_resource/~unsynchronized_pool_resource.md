# std::pmr::unsynchronized_pool_resource::~unsynchronized_pool_resource

Source: https://en.cppreference.com/w/cpp/memory/unsynchronized_pool_resource/~unsynchronized_pool_resource

```cpp
virtual ~unsynchronized_pool_resource(); // (since C++17)
```

Destroys an `unsynchronized_pool_resource`.

Deallocates all memory owned by this resource by calling `this->release()`.

## See also

- [`release`](https://en.cppreference.com/w/cpp/memory/unsynchronized_pool_resource/release): release all allocated memory (public member function)
