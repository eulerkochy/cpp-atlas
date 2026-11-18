# std::experimental::unique_resource<R, D>::~unique_resource

Source: https://en.cppreference.com/w/cpp/experimental/unique_resource/~unique_resource

```cpp
~unique_resource(); // (library fundamentals TS v3)
```

Disposes the resource by calling the deleter with the underlying resource handle if the `unique_resource` owns it, equivalent to calling `reset()`. Then destroys the stored resource handle and the deleter.

## See also

- [`reset`](https://en.cppreference.com/w/cpp/experimental/unique_resource/reset): disposes or replaces the managed resource (public member function)
- [(destructor)](https://en.cppreference.com/w/cpp/memory/unique_ptr/~unique_ptr): destructs the managed object if such is present (public member function of `std::unique_ptr<T,Deleter>`)
