# std::experimental::barrier::~barrier

Source: https://en.cppreference.com/w/cpp/experimental/barrier/~barrier

```cpp
~barrier(); // (concurrency TS)
```

Destroys the barrier.

The behavior is undefined if a thread is blocked at the synchronization point.
