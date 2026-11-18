# std::experimental::latch::wait

Source: https://en.cppreference.com/w/cpp/experimental/latch/wait

```cpp
void wait() const; // (1) (concurrency TS)
```

Blocks the calling thread until the internal counter reaches `0`. If it is zero already, returns immediately.

## Parameters

(none)

## Return value

(none)

## Exceptions

Throws nothing.
