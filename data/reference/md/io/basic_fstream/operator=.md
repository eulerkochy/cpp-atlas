# std::basic_fstream<CharT,Traits>::operator=

Source: https://en.cppreference.com/w/cpp/io/basic_fstream/operator=

```cpp
basic_fstream& operator=( basic_fstream&& other ); // (since C++11)
```

Move assigns the file stream `other` to `*this`, effectively move-assigning both the `std::basic_iostream` base class and the associated `std::basic_filebuf`.

`other` is left with no associated file. Note that the base class move assignment swaps all stream state variables (except for `rdbuf`) between `*this` and `other`.

## Parameters

- `other` - file stream to move

## Return value

`*this`

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`swap`](https://en.cppreference.com/w/cpp/io/basic_fstream/swap) (C++11): swaps two file streams (public member function)
- [`operator=`](https://en.cppreference.com/w/cpp/io/basic_filebuf/operator=) (C++11): assigns a `basic_filebuf` object (public member function of `std::basic_filebuf<CharT,Traits>`)
- [`operator=`](https://en.cppreference.com/w/cpp/io/basic_iostream/operator=) (C++11): move-assigns another `basic_iostream` (protected member function)
