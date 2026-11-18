# std::experimental::observer_ptr<W>::operator element_type*

Source: https://en.cppreference.com/w/cpp/experimental/observer_ptr/operator_pointer

```cpp
constexpr explicit operator element_type*() const noexcept; // (library fundamentals TS v2)
```

Provides an explicit conversion to the type of the stored pointer.

## Parameters

(none)

## Return value

A pointer to the watched object, i.e., `get()`.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`get`](https://en.cppreference.com/w/cpp/experimental/observer_ptr/get): returns a pointer to the watched object (public member function)
