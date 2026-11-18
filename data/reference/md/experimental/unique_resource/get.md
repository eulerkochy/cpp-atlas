# std::experimental::unique_resource<R, D>::get

Source: https://en.cppreference.com/w/cpp/experimental/unique_resource/get

```cpp
const R& get() const noexcept; // (library fundamentals TS v3)
```

Accesses the underlying resource handle.

## Parameters

(none)

## Return value

The underlying resource handle.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`operator*`](https://en.cppreference.com/w/cpp/experimental/unique_resource/operator*), [`operator->`](https://en.cppreference.com/w/cpp/experimental/unique_resource/operator*): accesses the pointee if the resource handle is a pointer (public member function)
- [`get`](https://en.cppreference.com/w/cpp/memory/unique_ptr/get): returns a pointer to the managed object (public member function of `std::unique_ptr<T,Deleter>`)
