# std::basic_spanbuf<CharT,Traits>::swap

Source: https://en.cppreference.com/w/cpp/io/basic_spanbuf/swap

```cpp
void swap( basic_spanbuf& rhs ); // (since C++23)
```

Swaps the state of `*this` and `rhs`.

Calls `std::basic_streambuf<Char, Traits>::swap(rhs)`, swaps the open mode of `*this` and `rhs`, and then makes them use the underlying buffer of each other.

## Parameters

- `rhs` - another `basic_stringbuf`

## Return value

(none)

## Exceptions

May throw implementation-defined exceptions.

## Notes

This function is called automatically when swapping stream objects, it is rarely necessary to call it directly.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`operator=`](https://en.cppreference.com/w/cpp/io/basic_spanbuf/operator=): assigns a `basic_spanbuf` object (public member function)
- [`swap`](https://en.cppreference.com/w/cpp/io/basic_ispanstream/swap): swaps two `basic_ispanstream` objects (public member function of `std::basic_ispanstream<CharT,Traits>`)
- [`swap`](https://en.cppreference.com/w/cpp/io/basic_ospanstream/swap): swaps two `basic_ospanstream` objects (public member function of `std::basic_ospanstream<CharT,Traits>`)
- [`swap`](https://en.cppreference.com/w/cpp/io/basic_spanstream/swap): swaps two `basic_spanstream` objects (public member function of `std::basic_spanstream<CharT,Traits>`)
