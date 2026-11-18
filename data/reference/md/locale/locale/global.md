# std::locale::global

Source: https://en.cppreference.com/w/cpp/locale/locale/global

```cpp
static locale global( const locale& loc );
```

Replaces the global C++ locale with `loc`, which means all future calls to the `std::locale` default constructor will now return a copy of `loc`. If `loc` has a name, also replaces the C locale as if by `std::setlocale(LC_ALL, loc.name().c_str());`. This function is the only way to modify the global C++ locale, which is otherwise equivalent to `std::locale::classic()` at program startup.

## Parameters

- `loc` - the new global C++ locale

## Return value

The previous value of the global C++ locale.

## Example

> Note: This section is incomplete Reason: no example

## Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| LWG 8 | C++98 | it was unspecified whether other library functions (such as `std::setlocale`) can modify the global C++ locale | specified (no other library functions allowed) |

## See also

- [(constructor)](https://en.cppreference.com/w/cpp/locale/locale/locale): constructs a new locale (public member function)
- [`classic`](https://en.cppreference.com/w/cpp/locale/locale/classic) [static]: obtains a reference to the "C" locale (public static member function)
- [`setlocale`](https://en.cppreference.com/w/cpp/locale/setlocale): gets and sets the current C locale (function)
