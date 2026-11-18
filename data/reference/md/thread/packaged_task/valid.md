# std::packaged_task<R(Args...)>::valid

Source: https://en.cppreference.com/w/cpp/thread/packaged_task/valid

```cpp
bool valid() const noexcept; // (since C++11)
```

Checks whether `*this` has a shared state.

## Parameters

(none)

## Return value

`true` if `*this` has a shared state, `false` otherwise.
