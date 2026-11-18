# std::experimental::observer_ptr<W>::operator bool

Source: https://en.cppreference.com/w/cpp/experimental/observer_ptr/operator_bool

```cpp
constexpr explicit operator bool() const noexcept; // (library fundamentals TS v2)
```

Checks whether `*this` has an associated watched object, i.e. whether `get() != nullptr`.

## Parameters

(none)

## Return value

`true` if `*this` has an associated watched object, `false` otherwise.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`get`](https://en.cppreference.com/w/cpp/experimental/observer_ptr/get): returns a pointer to the watched object (public member function)
