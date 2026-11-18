# std::atomic_ref<T>::operator value_type

Source: https://en.cppreference.com/w/cpp/atomic/atomic_ref/operator_T

```cpp
operator value_type() const noexcept; // (constexpr since C++26)
```

Equivalent to `return load();`.

## Return value

As described above.

## See also

- [`load`](https://en.cppreference.com/w/cpp/atomic/atomic_ref/load): atomically obtains the value of the referenced object (public member function)
