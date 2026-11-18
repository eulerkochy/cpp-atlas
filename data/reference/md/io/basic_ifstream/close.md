# std::basic_ifstream<CharT,Traits>::close

Source: https://en.cppreference.com/w/cpp/io/basic_ifstream/close

```cpp
void close();
```

Closes the associated file.

Effectively calls `rdbuf()->close()`. If an error occurs during operation, `setstate(failbit)` is called.

## Parameters

(none)

## Return value

(none)

## Notes

This function is called by the destructor of `basic_ifstream` when the stream object goes out of scope and is not usually invoked directly.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`is_open`](https://en.cppreference.com/w/cpp/io/basic_ifstream/is_open): checks if the stream has an associated file (public member function)
- [`open`](https://en.cppreference.com/w/cpp/io/basic_ifstream/open): opens a file and associates it with the stream (public member function)
- [`close`](https://en.cppreference.com/w/cpp/io/basic_filebuf/close): flushes the put area buffer and closes the associated file (public member function of `std::basic_filebuf<CharT,Traits>`)
