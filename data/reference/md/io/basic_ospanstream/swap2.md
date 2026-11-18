# std::swap(std::basic_ospanstream)

Source: https://en.cppreference.com/w/cpp/io/basic_ospanstream/swap2

```cpp
// Defined in header <spanstream>

template< class CharT, class Traits >
void swap( std::basic_ospanstream<CharT, Traits>& lhs,
           std::basic_ospanstream<CharT, Traits>& rhs ); // (since C++23)
```

Overloads the `std::swap` algorithm for `std::basic_ospanstream`. Exchanges the state of `lhs` with that of `rhs`. Effectively calls `lhs.swap(rhs)`.

## Parameters

- `lhs, rhs` - streams whose state to swap

## Return value

(none)

## Exceptions

May throw implementation-defined exceptions.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`swap`](https://en.cppreference.com/w/cpp/io/basic_ospanstream/swap): swaps two `basic_ospanstream` objects (public member function)
