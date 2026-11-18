# std::chrono::year::operator+=, std::chrono::year::operator-=

Source: https://en.cppreference.com/w/cpp/chrono/year/operator_arith

```cpp
constexpr std::chrono::year& operator+=( const std::chrono::years& y ) noexcept; // (1) (since C++20)
constexpr std::chrono::year& operator-=( const std::chrono::years& y ) noexcept; // (2) (since C++20)
```

Adds or subtracts `y.count()` years from the year value.

1) Equivalent to `*this = *this + y;`.

2) Equivalent to `*this = *this - y;`.

## Return value

A reference to this `year` after modification.

## Notes

If the result would be outside the range `[-32767,` `32767]`, the actual stored value is unspecified.

## Example

```cpp
#include <chrono>
#include <iostream>

int main()
{
    using namespace std::literals::chrono_literals;
    std::cout << std::boolalpha;

    std::chrono::year y{2020};

    y += std::chrono::years(12);
    std::cout << (y == 2032y) << ' ';

    y -= std::chrono::years(33);
    std::cout << (y == 1999y) << '\n';
}
```

Output:

```text
true true
```

## See also

- [`operator++`](https://en.cppreference.com/w/cpp/chrono/year/operator_inc_dec), [`operator++(int)`](https://en.cppreference.com/w/cpp/chrono/year/operator_inc_dec), [`operator--`](https://en.cppreference.com/w/cpp/chrono/year/operator_inc_dec), [`operator--(int)`](https://en.cppreference.com/w/cpp/chrono/year/operator_inc_dec): increments or decrements the year (public member function)
- [`operator+`](https://en.cppreference.com/w/cpp/chrono/year/operator_arith_2) (C++20), [`operator-`](https://en.cppreference.com/w/cpp/chrono/year/operator_arith_2): performs arithmetic on `year`s (function)
