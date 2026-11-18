# std::experimental::swap(std::experimental::optional)

Source: https://en.cppreference.com/w/cpp/experimental/optional/swap2

```cpp
// Defined in header <experimental/optional>

template< class T >
void swap( optional<T>& lhs, optional<T>& rhs ) noexcept(/* see below */); // (library fundamentals TS)
```

Overloads the `std::swap` algorithm for `std::experimental::optional`. Exchanges the state of `lhs` with that of `rhs`. Effectively calls `lhs.swap(rhs)`.

## Parameters

- `lhs, rhs` - `optional` objects whose states to swap

## Return value

(none)

## Exceptions

`noexcept` specification:

`noexcept(noexcept(lhs.swap(rhs)))`

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`swap`](https://en.cppreference.com/w/cpp/experimental/optional/swap): exchanges the contents (public member function)
