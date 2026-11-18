# std::experimental::swap(std::experimental::promise)

Source: https://en.cppreference.com/w/cpp/experimental/lib_extensions/promise/swap2

```cpp
template< class R >
void swap( std::experimental::promise<R> &lhs,
           std::experimental::promise<R> &rhs ) noexcept;
```

Overloads the `swap` algorithm for `std::experimental::promise`. Exchanges the state of `lhs` with that of `rhs`. Effectively calls `lhs.swap(rhs)`.

## Parameters

- `lhs, rhs` - promises whose states to swap

## Return value

(none)

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`swap`](https://en.cppreference.com/w/cpp/thread/promise/swap): swaps two promise objects (public member function of `std::promise<R>`)
