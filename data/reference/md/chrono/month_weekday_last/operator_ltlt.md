# std::chrono::operator<<(std::chrono::month_weekday_last)

Source: https://en.cppreference.com/w/cpp/chrono/month_weekday_last/operator_ltlt

```cpp
// Defined in header <chrono>

template< class CharT, class Traits >
std::basic_ostream<CharT, Traits>&
    operator<<( std::basic_ostream<CharT, Traits>& os,
                const std::chrono::month_weekday_last& mwdl ); // (since C++20)
```

Outputs a textual representation of `mwdl` into `os`, as if by

`os << std::format(os.getloc(), STATICALLY_WIDEN<CharT>("{:L}/{:L}"), mwdl.month(), mwdl.weekday_last());`

where `STATICALLY_WIDEN<CharT>("{:L}/{:L}")` is `"{:L}/{:L}"` if `CharT` is `char`, and `L"{:L}/{:L}"` if `CharT` is `wchar_t`.

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
- [`std::formatter<std::chrono::month>`](https://en.cppreference.com/w/cpp/chrono/month/formatter) (C++20): formatting support for `month` (class template specialization)
