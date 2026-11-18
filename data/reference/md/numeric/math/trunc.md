# std::trunc, std::truncf, std::truncl

Source: https://en.cppreference.com/w/cpp/numeric/math/trunc

```cpp
// Defined in header <cmath>

float       trunc ( float num );
double      trunc ( double num );
long double trunc ( long double num ); // (1) (until C++23)

constexpr /*floating-point-type*/
            trunc ( /*floating-point-type*/ num ); // (1) (since C++23)

float       truncf( float num ); // (2) (since C++11) (constexpr since C++23)

long double truncl( long double num ); // (3) (since C++11) (constexpr since C++23)

// SIMD overload (since C++26)

// Defined in header <simd>

template< /*math-floating-point*/ V >
constexpr /*deduced-simd-t*/<V>
            trunc ( const V& v_num ); // (S) (since C++26)

// Additional overloads (since C++11)

// Defined in header <cmath>

template< class Integer >
double      trunc ( Integer num ); // (A) (constexpr since C++23)
```

1-3) Computes the nearest integer not greater in magnitude than `num`. The library provides overloads of `std::trunc` for all cv-unqualified floating-point types as the type of the parameter. (since C++23)

(since C++26):

S) The SIMD overload performs an element-wise `std::trunc` on `v_num`.

  (See `math-floating-point` and `deduced-simd-t` for their definitions.)

A) Additional overloads are provided for all integer types, which are treated as `double`. (since C++11)

## Parameters

- `num` - floating-point or integer value

## Return value

If no errors occur, the nearest integer value not greater in magnitude than `num` (in other words, `num` rounded towards zero) is returned.

Return value

`num`

## Error handling

Errors are reported as specified in `math_errhandling`.

If the implementation supports IEEE floating-point arithmetic (IEC 60559),

- The current rounding mode has no effect.
- If `num` is ±∞, it is returned, unmodified.
- If `num` is ±0, it is returned, unmodified.
- If `num` is NaN, NaN is returned.

## Notes

`FE_INEXACT` may be (but isn't required to be) raised when truncating a non-integer finite value.

The largest representable floating-point values are exact integers in all standard floating-point formats, so this function never overflows on its own; however the result may overflow any integer type (including `std::intmax_t`), when stored in an integer variable.

The implicit conversion from floating-point to integral types also rounds towards zero, but is limited to the values that can be represented by the target type.

The additional overloads are not required to be provided exactly as (A). They only need to be sufficient to ensure that for their argument `num` of integer type, `std::trunc(num)` has the same effect as `std::trunc(static_cast<double>(num))`.

## Example

```cpp
#include <cmath>
#include <initializer_list>
#include <iostream>

int main()
{
    const auto data = std::initializer_list<double>
    {
        +2.7, -2.9, +0.7, -0.9, +0.0, 0.0, -INFINITY, +INFINITY, -NAN, +NAN
    };

    std::cout << std::showpos;
    for (double const x : data)
        std::cout << "trunc(" << x << ") == " << std::trunc(x) << '\n';
}
```

Possible output:

```text
trunc(+2.7) == +2
trunc(-2.9) == -2
trunc(+0.7) == +0
trunc(-0.9) == -0
trunc(+0) == +0
trunc(+0) == +0
trunc(-inf) == -inf
trunc(+inf) == +inf
trunc(-nan) == -nan
trunc(+nan) == +nan
```

## See also

- [`floor`](https://en.cppreference.com/w/cpp/numeric/math/floor), [`floorf`](https://en.cppreference.com/w/cpp/numeric/math/floor) (C++11), [`floorl`](https://en.cppreference.com/w/cpp/numeric/math/floor) (C++11): nearest integer not greater than the given value (function)
- [`ceil`](https://en.cppreference.com/w/cpp/numeric/math/ceil), [`ceilf`](https://en.cppreference.com/w/cpp/numeric/math/ceil) (C++11), [`ceill`](https://en.cppreference.com/w/cpp/numeric/math/ceil) (C++11): nearest integer not less than the given value (function)
- [`round`](https://en.cppreference.com/w/cpp/numeric/math/round) (C++11), [`roundf`](https://en.cppreference.com/w/cpp/numeric/math/round) (C++11), [`roundl`](https://en.cppreference.com/w/cpp/numeric/math/round) (C++11), [`lround`](https://en.cppreference.com/w/cpp/numeric/math/round) (C++11), [`lroundf`](https://en.cppreference.com/w/cpp/numeric/math/round) (C++11), [`lroundl`](https://en.cppreference.com/w/cpp/numeric/math/round) (C++11), [`llround`](https://en.cppreference.com/w/cpp/numeric/math/round) (C++11), [`llroundf`](https://en.cppreference.com/w/cpp/numeric/math/round) (C++11), [`llroundl`](https://en.cppreference.com/w/cpp/numeric/math/round) (C++11): nearest integer, rounding away from zero in halfway cases (function)
- [C documentation for `trunc`](https://en.cppreference.com/w/c/numeric/math/trunc)
