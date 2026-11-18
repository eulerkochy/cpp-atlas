# std::hash(std::experimental::shared_ptr)

Source: https://en.cppreference.com/w/cpp/experimental/shared_ptr/hash

```cpp
template< class T > struct hash<std::experimental::shared_ptr<T>>; // (library fundamentals TS)
```

The template specialization of `std::hash` for `std::experimental::shared_ptr<T>` allows users to obtain hashes of objects of type `std::experimental::shared_ptr<T>`.

For a given `std::experimental::shared_ptr<T> p`, this specialization ensures that `std::hash<std::experimental::shared_ptr<T>>()(p) == std::hash<T*>()(p.get())`.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`hash`](https://en.cppreference.com/w/cpp/utility/hash) (C++11): hash function object (class template)
