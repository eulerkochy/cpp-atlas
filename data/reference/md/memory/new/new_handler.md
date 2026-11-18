# std::new_handler

Source: https://en.cppreference.com/w/cpp/memory/new/new_handler

```cpp
// Defined in header <new>
typedef void (*new_handler)();
```

`std::new_handler` is the function pointer type (pointer to function that takes no arguments and returns void), which is used by the functions `std::set_new_handler` and `std::get_new_handler`.

## See also

- [`operator new`](https://en.cppreference.com/w/cpp/memory/new/operator_new), [`operator new[]`](https://en.cppreference.com/w/cpp/memory/new/operator_new): allocation functions (function)
- [`set_new_handler`](https://en.cppreference.com/w/cpp/memory/new/set_new_handler): registers a new handler (function)
- [`get_new_handler`](https://en.cppreference.com/w/cpp/memory/new/get_new_handler) (C++11): obtains the current new handler (function)
