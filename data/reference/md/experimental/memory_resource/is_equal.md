# std::experimental::pmr::memory_resource::is_equal

Source: https://en.cppreference.com/w/cpp/experimental/memory_resource/is_equal

```cpp
bool is_equal( const memory_resource& other ) const noexcept; // (library fundamentals TS)
```

Compares `*this` for equality with `other`. Two `memory_resource`s compare equal if and only if memory allocated from one `memory_resource` can be deallocated from the other and vice versa.

Equivalent to `return do_is_equal(other);`.

## See also

- [`do_is_equal`](https://en.cppreference.com/w/cpp/experimental/memory_resource/do_is_equal) [virtual]: compare for equality with another `memory_resource` (virtual protected member function)
