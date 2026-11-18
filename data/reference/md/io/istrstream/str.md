# std::istrstream::str

Source: https://en.cppreference.com/w/cpp/io/istrstream/str

```cpp
char* str(); // (deprecated in C++98) (removed in C++26)
```

Returns the pointer to the beginning of the buffer, after freezing it. Effectively calls `rdbuf()->str()`.

## Parameters

(none)

## Return value

Pointer to the beginning of the buffer in the associated `std::strstreambuf` or a null pointer if no buffer is available.

## Example

> Note: This section is incomplete Reason: no example
