# std::function<R(Args...)>::~function

Source: https://en.cppreference.com/w/cpp/utility/functional/function/~function

```cpp
~function(); // (since C++11)
```

Destroys the `std::function` instance. If the `std::function` is not *empty*, its *target* is destroyed also.

## See also

- [(destructor)](https://en.cppreference.com/w/cpp/utility/functional/move_only_function/~move_only_function): destroys a `std::move_only_function` object (public member function of `std::move_only_function`)
