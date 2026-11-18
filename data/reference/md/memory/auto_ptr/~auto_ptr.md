# std::auto_ptr<T>::~auto_ptr

Source: https://en.cppreference.com/w/cpp/memory/auto_ptr/~auto_ptr

```cpp
~auto_ptr() throw(); // (deprecated in C++11) (removed in C++17)
```

Destroys the managed object. Calls `delete get()`.
