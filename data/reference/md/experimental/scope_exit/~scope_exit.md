# std::experimental::scope_exit<EF>::~scope_exit

Source: https://en.cppreference.com/w/cpp/experimental/scope_exit/~scope_exit

```cpp
~scope_exit() noexcept; // (library fundamentals TS v3)
```

Calls the exit function if the `scope_exit` is active, then destroys the stored `EF` (if it is a function object) and any other non-static data members.

## See also

- [`release`](https://en.cppreference.com/w/cpp/experimental/scope_exit/release): makes the `scope_exit` inactive (public member function)
