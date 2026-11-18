# std::experimental::observer_ptr<W>::release

Source: https://en.cppreference.com/w/cpp/experimental/observer_ptr/release

```cpp
constexpr element_type* release() noexcept; // (library fundamentals TS v2)
```

Stop watching the watched object, if any. `get()` returns `nullptr` after the call.

## Parameters

(none)

## Return value

A pointer to the previously watched object, or `nullptr` if there was no watched object, i.e. the value which would be returned by `get()` before the call.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`get`](https://en.cppreference.com/w/cpp/experimental/observer_ptr/get): returns a pointer to the watched object (public member function)
- [`reset`](https://en.cppreference.com/w/cpp/experimental/observer_ptr/reset): replaces the watched object (public member function)
