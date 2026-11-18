# std::experimental::latch::is_ready

Source: https://en.cppreference.com/w/cpp/experimental/latch/is_ready

```cpp
bool is_ready() const noexcept; // (1) (concurrency TS)
```

Returns `true` if the internal counter equals zero.

## Parameters

(none)

## Return value

`true` if the internal counter of `*this` latch equals zero.
