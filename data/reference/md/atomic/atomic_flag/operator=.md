# std::atomic_flag::operator=

Source: https://en.cppreference.com/w/cpp/atomic/atomic_flag/operator=

```cpp
// Defined in header <atomic>
atomic_flag& operator=( const atomic_flag& ) = delete; // (1) (since C++11)
atomic_flag& operator=( const atomic_flag& ) volatile = delete; // (2) (since C++11)
```

`std::atomic_flag` is not assignable, its assignment operators are deleted.
