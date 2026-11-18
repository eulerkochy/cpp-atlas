# std::copyable_function::~copyable_function

Source: https://en.cppreference.com/w/cpp/utility/functional/copyable_function/~copyable_function

```cpp
~copyable_function(); // (since C++26)
```

Destroys the `std::copyable_function` object. If the `std::copyable_function` is not empty, its target is also destroyed.

## See also

- [(destructor)](https://en.cppreference.com/w/cpp/utility/functional/function/~function): destroys a `std::function` instance (public member function of `std::function<R(Args...)>`)
- [(destructor)](https://en.cppreference.com/w/cpp/utility/functional/move_only_function/~move_only_function): destroys a `std::move_only_function` object (public member function of `std::move_only_function`)
