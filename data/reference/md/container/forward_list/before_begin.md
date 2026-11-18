# std::forward_list<T,Allocator>::before_begin, cbefore_begin

Source: https://en.cppreference.com/w/cpp/container/forward_list/before_begin

```cpp
iterator before_begin() noexcept; // (since C++11)
const_iterator before_begin() const noexcept; // (since C++11)
const_iterator cbefore_begin() const noexcept; // (since C++11)
```

Returns an iterator to the element before the first element of the container. This element acts as a placeholder, attempting to access it results in undefined behavior. The only usage cases are in functions `insert_after()`, `emplace_after()`, `erase_after()`, `splice_after()` and the increment operator: incrementing the before-begin iterator gives exactly the same iterator as obtained from `begin()`/`cbegin()`.

## Parameters

(none)

## Return value

Iterator to the element before the first element.

## Complexity

Constant.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`begin`](https://en.cppreference.com/w/cpp/container/forward_list/begin), [`cbegin`](https://en.cppreference.com/w/cpp/container/forward_list/begin): returns an iterator to the beginning (public member function)
- [`end`](https://en.cppreference.com/w/cpp/container/forward_list/end), [`cend`](https://en.cppreference.com/w/cpp/container/forward_list/end): returns an iterator to the end (public member function)
