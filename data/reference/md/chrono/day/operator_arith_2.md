# std::chrono::operator+, std::chrono::operator- (std::chrono::day)

Source: https://en.cppreference.com/w/cpp/chrono/day/operator_arith_2

```cpp
// Defined in header <chrono>

constexpr std::chrono::day operator+( const std::chrono::day&  d,
                                      const std::chrono::days& ds ) noexcept; // (1) (since C++20)

constexpr std::chrono::day operator+( const std::chrono::days& ds,
                                      const std::chrono::day&  d ) noexcept; // (2) (since C++20)

constexpr std::chrono::day operator-( const std::chrono::day&  d,
                                      const std::chrono::days& ds ) noexcept; // (3) (since C++20)

constexpr std::chrono::days operator-( const std::chrono::day& x,
                                       const std::chrono::day& y ) noexcept; // (4) (since C++20)
```

1,2) Adds `ds.count()` days to `d`.

3) Subtracts `ds.count()` days from `d`.

4) Calculate the difference, in days, between two `day` `x` and `y`.

## Return value

1,2) `std::chrono::day(unsigned(d) + ds.count())`

3) `std::chrono::day(unsigned(d) - ds.count())`

4) `std::chrono::days(int(unsigned(x)) - int(unsigned(y)))`

## Notes

1-3) If the result would be outside the range `[​0​,` `255]`, the actual stored value is unspecified.

## Example

```cpp
#include <cassert>
#include <chrono>

int main()
{
    std::chrono::day d{15};

    d = d + std::chrono::days(2);
    assert(d == std::chrono::day(17));

    d = d - std::chrono::days(3);
    assert(d == std::chrono::day(14));

    constexpr std::chrono::days ds = std::chrono::day(16) - std::chrono::day(14);
    static_assert(ds == std::chrono::days(2));
}
```

## See also

- [`operator++`](https://en.cppreference.com/w/cpp/chrono/day/operator_inc_dec), [`operator++(int)`](https://en.cppreference.com/w/cpp/chrono/day/operator_inc_dec), [`operator--`](https://en.cppreference.com/w/cpp/chrono/day/operator_inc_dec), [`operator--(int)`](https://en.cppreference.com/w/cpp/chrono/day/operator_inc_dec): increments or decrements the day (public member function)
- [`operator+=`](https://en.cppreference.com/w/cpp/chrono/day/operator_arith), [`operator-=`](https://en.cppreference.com/w/cpp/chrono/day/operator_arith): adds or subtracts a number of days (public member function)
