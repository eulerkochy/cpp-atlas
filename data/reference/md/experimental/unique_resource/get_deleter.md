# std::experimental::unique_resource<R, D>::get_deleter

Source: https://en.cppreference.com/w/cpp/experimental/unique_resource/get_deleter

```cpp
const D& get_deleter() const noexcept; // (library fundamentals TS v3)
```

Accesses the deleter object which would be used for disposing the managed resource.

## Parameters

(none)

## Return value

The stored deleter.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`get_deleter`](https://en.cppreference.com/w/cpp/memory/unique_ptr/get_deleter): returns the deleter that is used for destruction of the managed object (public member function of `std::unique_ptr<T,Deleter>`)
