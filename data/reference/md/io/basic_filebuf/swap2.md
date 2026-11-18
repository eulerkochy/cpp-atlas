# std::swap(std::basic_filebuf)

Source: https://en.cppreference.com/w/cpp/io/basic_filebuf/swap2

```cpp
template< class CharT, class Traits >
void swap( std::basic_filebuf<CharT,Traits>& lhs,
           std::basic_filebuf<CharT,Traits>& rhs ); // (since C++11)
```

Overloads the `std::swap` algorithm for `std::basic_filebuf`. Exchanges the state of `lhs` with that of `rhs`. Effectively calls `lhs.swap(rhs)`.

## Parameters

- `lhs, rhs` - `std::basic_filebuf` objects whose states to swap

## Return value

(none)

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`swap`](https://en.cppreference.com/w/cpp/io/basic_filebuf/swap) (C++11): swaps two `basic_filebuf` objects (public member function)
- [`swap`](https://en.cppreference.com/w/cpp/algorithm/swap): swaps the values of two objects (function template)
