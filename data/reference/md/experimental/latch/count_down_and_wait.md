# std::experimental::latch::count_down_and_wait

Source: https://en.cppreference.com/w/cpp/experimental/latch/count_down_and_wait

```cpp
void count_down_and_wait(); // (1) (concurrency TS)
```

Atomically decrements the internal counter by `1` and (if necessary) blocks the calling thread until the counter reaches zero.

The behavior is undefined if the internal counter is already zero.

This operation synchronizes with all calls that block on this latch and all `is_ready` calls on this latch that returns `true`.

## Parameters

(none)

## Return value

(none)

## Exceptions

Throws nothing.
