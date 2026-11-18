# std::experimental::packaged_task<R(Args...)>::get_memory_resource

Source: https://en.cppreference.com/w/cpp/experimental/lib_extensions/packaged_task/get_memory_resource

```cpp
std::experimental::pmr::memory_resource* get_memory_resource() const noexcept; // (library fundamentals TS)
```

Returns a pointer to the memory resource used by this object to allocate memory.

## Parameters

(none)

## Return value

A pointer to the memory resource used by this object to allocate memory.

## See also

- [(constructor)](https://en.cppreference.com/w/cpp/experimental/lib_extensions/packaged_task/packaged_task): constructs the task object (public member function)
