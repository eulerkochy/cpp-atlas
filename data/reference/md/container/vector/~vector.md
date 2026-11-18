# std::vector<T,Allocator>::~vector

Source: https://en.cppreference.com/w/cpp/container/vector/~vector

```cpp
~vector(); // (constexpr since C++20)
```

A destructor. Destructs the `vector`. The destructors of the elements are called and the used storage is deallocated. Note, that if the elements are pointers, the pointed-to objects are not destroyed.

## Complexity

Linear in the size of the `vector`.
