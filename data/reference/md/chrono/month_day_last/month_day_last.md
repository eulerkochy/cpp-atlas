# std::chrono::month_day_last::month_day_last

Source: https://en.cppreference.com/w/cpp/chrono/month_day_last/month_day_last

```cpp
constexpr explicit month_day_last( const std::chrono::month& m ) noexcept; // (since C++20)
```

Constructs a `month_day_last` object that represents the last day of the month `m`.

## Notes

A more convenient way to construct a `month_day_last` is with `operator/`, e.g., `std::chrono::April/std::chrono::last`.

## See also

- [`operator/`](https://en.cppreference.com/w/cpp/chrono/operator_slash) (C++20): conventional syntax for Gregorian calendar date creation (function)
