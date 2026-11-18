# std::experimental::atomic_weak_ptr<T>::is_lock_free

Source: https://en.cppreference.com/w/cpp/experimental/atomic_weak_ptr/is_lock_free

```cpp
bool is_lock_free() const noexcept;
```

Checks whether the atomic operations on all objects of this type are lock-free.

## Parameters

(none)

## Return value

`true` if the atomic operations on the objects of this type are lock-free, `false` otherwise.

## See also

- [`std::atomic_is_lock_free(std::shared_ptr)`](https://en.cppreference.com/w/cpp/memory/shared_ptr/atomic) (deprecated in C++20), [`std::atomic_load(std::shared_ptr)`](https://en.cppreference.com/w/cpp/memory/shared_ptr/atomic) (removed in C++26), [`std::atomic_load_explicit(std::shared_ptr)`](https://en.cppreference.com/w/cpp/memory/shared_ptr/atomic), [`std::atomic_store(std::shared_ptr)`](https://en.cppreference.com/w/cpp/memory/shared_ptr/atomic), [`std::atomic_store_explicit(std::shared_ptr)`](https://en.cppreference.com/w/cpp/memory/shared_ptr/atomic), [`std::atomic_exchange(std::shared_ptr)`](https://en.cppreference.com/w/cpp/memory/shared_ptr/atomic), [`std::atomic_exchange_explicit(std::shared_ptr)`](https://en.cppreference.com/w/cpp/memory/shared_ptr/atomic), [`std::atomic_compare_exchange_weak(std::shared_ptr)`](https://en.cppreference.com/w/cpp/memory/shared_ptr/atomic), [`std::atomic_compare_exchange_strong(std::shared_ptr)`](https://en.cppreference.com/w/cpp/memory/shared_ptr/atomic), [`std::atomic_compare_exchange_weak_explicit(std::shared_ptr)`](https://en.cppreference.com/w/cpp/memory/shared_ptr/atomic), [`std::atomic_compare_exchange_strong_explicit(std::shared_ptr)`](https://en.cppreference.com/w/cpp/memory/shared_ptr/atomic): specializes atomic operations for `std::shared_ptr` (function template)
