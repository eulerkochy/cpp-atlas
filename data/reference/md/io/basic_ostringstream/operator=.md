# std::basic_ostringstream::operator=

Source: https://en.cppreference.com/w/cpp/io/basic_ostringstream/operator=

```cpp
basic_ostringstream& operator=( basic_ostringstream&& other ); // (since C++11)
```

Move assigns the string stream `other` to `*this`, effectively move-assigning both the `std::basic_ostream` base class and the associated `std::basic_stringbuf`.

Note that the base class move assignment swaps all stream state variables (except for `rdbuf`) between `*this` and `other`.

## Parameters

- `other` - string stream to move from

## Return value

`*this`

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`swap`](https://en.cppreference.com/w/cpp/io/basic_ostringstream/swap) (C++11): swaps two string streams (public member function)
- [`operator=`](https://en.cppreference.com/w/cpp/io/basic_stringbuf/operator=) (C++11): assigns a `basic_stringbuf` object (public member function of `std::basic_stringbuf<CharT,Traits,Allocator>`)
- [`operator=`](https://en.cppreference.com/w/cpp/io/basic_ostream/operator=) (C++11): move-assigns from another `basic_ostream` (protected member function)
