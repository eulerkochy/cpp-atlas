# std::move_only_function::~move_only_function

Source: https://en.cppreference.com/w/cpp/utility/functional/move_only_function/~move_only_function

```cpp
~move_only_function(); // (since C++23)
```

Destroys the `std::move_only_function` object. If the `std::move_only_function` is not empty, its target is also destroyed.

## See also

- [(destructor)](https://en.cppreference.com/w/cpp/utility/functional/function/~function): destroys a `std::function` instance (public member function of `std::function<R(Args...)>`)
