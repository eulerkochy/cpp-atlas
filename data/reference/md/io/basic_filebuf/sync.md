# std::basic_filebuf<CharT,Traits>::sync

Source: https://en.cppreference.com/w/cpp/io/basic_filebuf/sync

```cpp
protected:
virtual int sync()
```

If a put area exists (e.g. the file was opened for writing), calls `overflow()` to write all pending output to the file, then flushes the file as if by calling `std::fflush`.

If a get area exists (e.g. the file was opened for reading), the effect is implementation-defined. Typical implementation may empty out the get area and move the current file position back by the corresponding number of bytes.

## Parameters

(none)

## Return value

`​0​` in case of success, `-1` in case of failure.

## Notes

`sync()` or its equivalent is implicitly called for output streams by `close()`, `seekoff()`, and `seekpos()` and explicitly called by `std::basic_streambuf::pubsync()`

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`pubsync`](https://en.cppreference.com/w/cpp/io/basic_streambuf/pubsync): invokes `sync()` (public member function of `std::basic_streambuf<CharT,Traits>`)
- [`fflush`](https://en.cppreference.com/w/cpp/io/c/fflush): synchronizes an output stream with the actual file (function)
