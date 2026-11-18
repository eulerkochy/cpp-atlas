# std::experimental::flex_barrier::~flex_barrier

Source: https://en.cppreference.com/w/cpp/experimental/flex_barrier/~flex_barrier

```cpp
~flex_barrier(); // (concurrency TS)
```

Destroys the `flex_barrier`.

The behavior is undefined if a thread is blocked at the synchronization point.
