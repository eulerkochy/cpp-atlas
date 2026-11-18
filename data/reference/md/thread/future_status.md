# std::future_status

Source: https://en.cppreference.com/w/cpp/thread/future_status

```cpp
// Defined in header <future>

enum class future_status {
    ready,
    timeout,
    deferred
}; // (since C++11)
```

Specifies state of a future as returned by `wait_for` and `wait_until` functions of `std::future` and `std::shared_future`.

## Constants

**Name — Explanation**

- `deferred`: the shared state contains a deferred function, so the result will be computed only when explicitly requested
- `ready`: the shared state is ready
- `timeout`: the shared state did not become ready before specified timeout duration has passed

## See also

- [`wait_for`](https://en.cppreference.com/w/cpp/thread/future/wait_for): waits for the result, returns if it is not available for the specified timeout duration (public member function of `std::future<T>`)
- [`wait_for`](https://en.cppreference.com/w/cpp/thread/shared_future/wait_for): waits for the result, returns if it is not available for the specified timeout duration (public member function of `std::shared_future<T>`)
- [`wait_until`](https://en.cppreference.com/w/cpp/thread/future/wait_until): waits for the result, returns if it is not available until specified time point has been reached (public member function of `std::future<T>`)
- [`wait_until`](https://en.cppreference.com/w/cpp/thread/shared_future/wait_until): waits for the result, returns if it is not available until specified time point has been reached (public member function of `std::shared_future<T>`)
