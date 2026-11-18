# std::basic_streambuf<CharT,Traits>::getloc

Source: https://en.cppreference.com/w/cpp/io/basic_streambuf/getloc

```cpp
std::locale getloc() const;
```

Returns the associated locale.

The associated locale is the value supplied to `pubimbue()` on the last call, or, if that function has not been called, the value of the global locale (`std::locale`) at the time of the construction of the streambuf.

## Parameters

(none)

## Return value

The associated locale.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`pubimbue`](https://en.cppreference.com/w/cpp/io/basic_streambuf/pubimbue): changes the associated locale and invokes `imbue()` (public member function)
