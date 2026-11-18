# std::experimental::observer_ptr<W>::get

Source: https://en.cppreference.com/w/cpp/experimental/observer_ptr/get

```cpp
constexpr element_type* get() const noexcept; // (library fundamentals TS v2)
```

Returns a pointer to the watched object or `nullptr` if no object is watched.

## Parameters

(none)

## Return value

Pointer to the watched object or `nullptr` if no object is watched.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`release`](https://en.cppreference.com/w/cpp/experimental/observer_ptr/release): returns a pointer to the watched object and stops watching the object (public member function)
