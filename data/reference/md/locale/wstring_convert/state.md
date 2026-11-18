# std::wstring_convert<Codecvt,Elem,Wide_alloc,Byte_alloc>::state

Source: https://en.cppreference.com/w/cpp/locale/wstring_convert/state

```cpp
// Defined in header <locale>
state_type state() const;
```

Returns the current value of the conversion state, which is stored in this `wstring_convert` object. The conversion state may be explicitly set in the constructor and is updated by all conversion operations.

## Return value

`cvtstate`

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`to_bytes`](https://en.cppreference.com/w/cpp/locale/wstring_convert/to_bytes): converts a wide string into a byte string (public member function)
- [`from_bytes`](https://en.cppreference.com/w/cpp/locale/wstring_convert/from_bytes): converts a byte string into a wide string (public member function)
- [`mbsinit`](https://en.cppreference.com/w/cpp/string/multibyte/mbsinit): checks if the `std::mbstate_t` object represents initial shift state (function)
