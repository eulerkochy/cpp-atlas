# std::va_list

Source: https://en.cppreference.com/w/cpp/utility/variadic/va_list

```cpp
// Defined in header <cstdarg>
typedef /* unspecified */ va_list;
```

`va_list` is a complete object type (in practice, a unique built-in type or `char*`) suitable for holding the information needed by the macros `va_start`, `va_copy`, `va_arg`, and `va_end`.

If a `va_list` instance is created, passed to another function, and used via `va_arg` in that function, then any subsequent use in the calling function should be preceded by a call to `va_end`.

It is legal to pass a pointer to a `va_list` object to another function and then use that object after the function returns.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`va_start`](https://en.cppreference.com/w/cpp/utility/variadic/va_start): enables access to variadic function arguments (function macro)
- [`va_copy`](https://en.cppreference.com/w/cpp/utility/variadic/va_copy) (C++11): makes a copy of the variadic function arguments (function macro)
- [`va_arg`](https://en.cppreference.com/w/cpp/utility/variadic/va_arg): accesses the next variadic function argument (function macro)
- [`va_end`](https://en.cppreference.com/w/cpp/utility/variadic/va_end): ends traversal of the variadic function arguments (function macro)
- [C documentation for `va_list`](https://en.cppreference.com/w/c/variadic/va_list)
