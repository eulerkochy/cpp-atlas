# std::experimental::function<R(Args...)>::get_memory_resource

Source: https://en.cppreference.com/w/cpp/experimental/function/get_memory_resource

```cpp
std::experimental::pmr::memory_resource* get_memory_resource() const noexcept; // (library fundamentals TS) (removed in library fundamentals TS v3)
```

Returns a pointer to the memory resource used by this object to allocate memory.

## Parameters

(none)

## Return value

A pointer to the memory resource used by this object to allocate memory.

## See also

- [(constructor)](https://en.cppreference.com/w/cpp/experimental/function/function): constructs a new `std::experimental::function` instance (public member function)
- [`get_allocator`](https://en.cppreference.com/w/cpp/experimental/function/get_allocator) (library fundamentals TS v3): retrieves a type-erased `std::pmr::polymorphic_allocator` used by this object to allocate memory (public member function)
