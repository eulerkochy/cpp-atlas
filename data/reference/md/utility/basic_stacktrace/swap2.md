# std::swap(std::basic_stacktrace)

Source: https://en.cppreference.com/w/cpp/utility/basic_stacktrace/swap2

```cpp
// Defined in header <stacktrace>

template< class Allocator >
void swap( std::basic_stacktrace<Allocator>& lhs, std::basic_stacktrace<Allocator>& rhs )
    noexcept(noexcept(lhs.swap(rhs))); // (since C++23)
```

Specializes the `std::swap` algorithm for `std::basic_stacktrace`. Swaps the contents of `lhs` and `rhs`. Equivalent to `lhs.swap(rhs);`.

## Parameters

- `lhs, rhs` - stacktraces whose contents to swap

## Return value

(none)

## Complexity

Constant.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`swap`](https://en.cppreference.com/w/cpp/utility/basic_stacktrace/swap): swaps the contents (public member function)
