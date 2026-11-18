# std::basic_filebuf<CharT,Traits>::uflow

Source: https://en.cppreference.com/w/cpp/io/basic_filebuf/uflow

```cpp
protected:
virtual int_type uflow()
```

Behaves like the `underflow()`, except that if `underflow()` succeeds (does not return `Traits::eof()`), then advances the next pointer for the get area. In other words, consumes one of the characters obtained by `underflow()`.

## Parameters

(none)

## Return value

The value of the character that was read and consumed in case of success, or `Traits::eof()` in case of failure.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`uflow`](https://en.cppreference.com/w/cpp/io/basic_streambuf/uflow) [virtual]: reads characters from the associated input sequence to the get area and advances the next pointer (virtual protected member function of `std::basic_streambuf<CharT,Traits>`)
- [`underflow`](https://en.cppreference.com/w/cpp/io/basic_filebuf/underflow) [virtual]: reads from the associated file (virtual protected member function)
- [`overflow`](https://en.cppreference.com/w/cpp/io/basic_filebuf/overflow) [virtual]: writes characters to the associated file from the put area (virtual protected member function)
