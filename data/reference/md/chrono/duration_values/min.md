# std::chrono::duration_values<Rep>::min

Source: https://en.cppreference.com/w/cpp/chrono/duration_values/min

```cpp
static constexpr Rep min(); // (since C++11) (until C++20)
static constexpr Rep min() noexcept; // (since C++20)
```

Returns the lowest possible representation.

## Parameters

(none)

## Return value

`std::numeric_limits<Rep>::lowest()`

## See also

- [`min`](https://en.cppreference.com/w/cpp/chrono/duration/min) [static]: returns the special duration value min (public static member function of `std::chrono::duration<Rep,Period>`)
- [`zero`](https://en.cppreference.com/w/cpp/chrono/duration_values/zero) [static]: returns a zero-length representation (public static member function)
- [`max`](https://en.cppreference.com/w/cpp/chrono/duration_values/max) [static]: returns the largest possible representation (public static member function)
