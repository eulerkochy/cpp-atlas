# std::chrono::operator<<(std::chrono::hh_mm_ss)

Source: https://en.cppreference.com/w/cpp/chrono/hh_mm_ss/operator_ltlt

```cpp
// Defined in header <chrono>

template< class CharT, class Traits, class Duration >
std::basic_ostream<CharT, Traits>&
    operator<<( std::basic_ostream<CharT, Traits>& os,
                const std::chrono::hh_mm_ss<Duration>& t ); // (since C++20)
```

Outputs `t` into the stream `os`.

Equivalent to `return os << std::format(os.getloc(), STATICALLY_WIDEN<CharT>("{:L%T}"), hms);` where `STATICALLY_WIDEN<CharT>("{:L%T}")` is `"{:L%T}"` if `CharT` is `char`, and `L"{:L%T}"` if `CharT` is `wchar_t`.

## Parameters

- `os` - the output stream
- `t` - the time of day to be output

## Return value

`os`

## Example

> Note: This section is incomplete Reason: no example

## Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| P2372R3 | C++20 | the given locale was used by default | `L` is needed to use the given locale |

## See also

- [`format`](https://en.cppreference.com/w/cpp/utility/format/format) (C++20): stores formatted representation of the arguments in a new string (function template)
- [`std::formatter<std::chrono::hh_mm_ss>`](https://en.cppreference.com/w/cpp/chrono/hh_mm_ss/formatter) (C++20): formatting support for `hh_mm_ss` (class template specialization)
