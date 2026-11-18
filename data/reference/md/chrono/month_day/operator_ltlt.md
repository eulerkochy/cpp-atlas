# std::chrono::operator<<(std::chrono::month_day)

Source: https://en.cppreference.com/w/cpp/chrono/month_day/operator_ltlt

```cpp
// Defined in header <chrono>

template< class CharT, class Traits >
std::basic_ostream<CharT, Traits>&
    operator<<( std::basic_ostream<CharT, Traits>& os, const std::chrono::month_day& md ); // (since C++20)
```

Outputs a textual representation of `md` into the stream `os`, as if by

`os << std::format(os.getloc(), STATICALLY_WIDEN<CharT>("{:L}/{}"), md.month(), md.day())`

where `STATICALLY_WIDEN<CharT>("{:L}/{}")` is `"{:L}/{}"` if `CharT` is `char`, and `L"{:L}/{}"` if `CharT` is `wchar_t`.

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
- [`std::formatter<std::chrono::month_day>`](https://en.cppreference.com/w/cpp/chrono/month_day/formatter) (C++20): formatting support for `month_day` (class template specialization)
