# std::move_sentinel<S>::base

Source: https://en.cppreference.com/w/cpp/iterator/move_sentinel/base

```cpp
constexpr S base() const; // (since C++20)
```

Returns the underlying base sentinel.

## Parameters

(none)

## Return value

The underlying sentinel.

## Exceptions

May throw implementation-defined exceptions.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`base`](https://en.cppreference.com/w/cpp/iterator/move_iterator/base) (C++11): accesses the underlying iterator (public member function of `std::move_iterator<Iter>`)
