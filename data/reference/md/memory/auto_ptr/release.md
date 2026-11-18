# std::auto_ptr<T>::release

Source: https://en.cppreference.com/w/cpp/memory/auto_ptr/release

```cpp
T* release() throw(); // (deprecated in C++11) (removed in C++17)
```

Releases the held pointer. After the call `*this` holds the null pointer.

## Parameters

(none)

## Return value

`get()`.

## See also

- [`reset`](https://en.cppreference.com/w/cpp/memory/auto_ptr/reset): replaces the managed object (public member function)
