# std::experimental::future<T>::is_ready

Source: https://en.cppreference.com/w/cpp/experimental/future/is_ready

```cpp
bool is_ready() const;
```

Checks if the associated shared state is ready.

The behavior is undefined if `valid()` is `false`.

## Parameters

(none)

## Return value

`true` if the associated shared state is ready, otherwise `false`.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`valid`](https://en.cppreference.com/w/cpp/thread/future/valid): checks if the future has a shared state (public member function of `std::future<T>`)
