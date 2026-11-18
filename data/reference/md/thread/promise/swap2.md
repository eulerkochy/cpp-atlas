# std::swap(std::promise)

Source: https://en.cppreference.com/w/cpp/thread/promise/swap2

```cpp
// Defined in header <future>

template< class R >
void swap( promise<R>& lhs, promise<R>& rhs ) noexcept; // (since C++11)
```

Specializes the `std::swap` algorithm for `std::promise`. Exchanges the shared state of `lhs` with that of `rhs`. Effectively calls `lhs.swap(rhs)`.

## Parameters

- `lhs, rhs` - promises whose states to swap

## Return value

(none)

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`swap`](https://en.cppreference.com/w/cpp/thread/promise/swap): swaps two promise objects (public member function)
