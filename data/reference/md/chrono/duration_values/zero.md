# std::chrono::duration_values<Rep>::zero

Source: https://en.cppreference.com/w/cpp/chrono/duration_values/zero

```cpp
static constexpr Rep zero(); // (since C++11) (until C++20)
static constexpr Rep zero() noexcept; // (since C++20)
```

Returns a zero-length representation.

## Parameters

(none)

## Return value

`Rep(0)`

## See also

- [`zero`](https://en.cppreference.com/w/cpp/chrono/duration/zero) [static]: returns the special duration value zero (public static member function of `std::chrono::duration<Rep,Period>`)
- [`min`](https://en.cppreference.com/w/cpp/chrono/duration_values/min) [static]: returns the smallest possible representation (public static member function)
- [`max`](https://en.cppreference.com/w/cpp/chrono/duration_values/max) [static]: returns the largest possible representation (public static member function)
