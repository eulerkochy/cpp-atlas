# std::get_new_handler

Source: https://en.cppreference.com/w/cpp/memory/new/get_new_handler

```cpp
// Defined in header <new>
std::new_handler get_new_handler() noexcept; // (since C++11)
```

Returns the currently installed new-handler, which may be a null pointer.

This function is thread-safe. Previous call to `std::set_new_handler` *synchronizes-with* (see `std::memory_order`) the subsequent calls to `std::get_new_handler`.

## Parameters

(none)

## Return value

The currently installed *new-handler*, which may be a null pointer value.

## See also

- [`operator new`](https://en.cppreference.com/w/cpp/memory/new/operator_new), [`operator new[]`](https://en.cppreference.com/w/cpp/memory/new/operator_new): allocation functions (function)
- [`set_new_handler`](https://en.cppreference.com/w/cpp/memory/new/set_new_handler): registers a new handler (function)
- [`new_handler`](https://en.cppreference.com/w/cpp/memory/new/new_handler): function pointer type of the new handler (typedef)
