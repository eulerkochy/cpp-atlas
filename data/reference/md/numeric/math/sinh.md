# std::sinh, std::sinhf, std::sinhl

Source: https://en.cppreference.com/w/cpp/numeric/math/sinh

```cpp
// Defined in header <cmath>

float       sinh ( float num );
double      sinh ( double num );
long double sinh ( long double num ); // (1) (until C++23)

/*floating-point-type*/
            sinh ( /*floating-point-type*/ num ); // (1) (since C++23) (constexpr since C++26)

float       sinhf( float num ); // (2) (since C++11) (constexpr since C++26)

long double sinhl( long double num ); // (3) (since C++11) (constexpr since C++26)

// SIMD overload (since C++26)

// Defined in header <simd>

template< /*math-floating-point*/ V >
constexpr /*deduced-simd-t*/<V>
            sinh ( const V& v_num ); // (S) (since C++26)

// Additional overloads (since C++11)

// Defined in header <cmath>

template< class Integer >
double      sinh ( Integer num ); // (A) (constexpr since C++26)
```

1-3) Computes the hyperbolic sine of `num`. The library provides overloads of `std::sinh` for all cv-unqualified floating-point types as the type of the parameter. (since C++23)

(since C++26):

S) The SIMD overload performs an element-wise `std::sinh` on `v_num`.

  (See `math-floating-point` and `deduced-simd-t` for their definitions.)

A) Additional overloads are provided for all integer types, which are treated as `double`. (since C++11)

## Parameters

- `num` - floating-point or integer value

## Return value

If no errors occur, the hyperbolic sine of

`num`

(

sinh(num)

, or

e^(num)-e^(-num)
2

) is returned.

If a range error due to overflow occurs, `±HUGE_VAL`, `±HUGE_VALF`, or `±HUGE_VALL` is returned.

If a range error occurs due to underflow, the correct result (after rounding) is returned.

## Error handling

Errors are reported as specified in `math_errhandling`.

If the implementation supports IEEE floating-point arithmetic (IEC 60559),

- if the argument is ±0 or ±∞, it is returned unmodified.
- if the argument is NaN, NaN is returned.

## Notes

POSIX specifies that in case of underflow, `num` is returned unmodified, and if that is not supported, and implementation-defined value no greater than `DBL_MIN`, `FLT_MIN`, and `LDBL_MIN` is returned.

The additional overloads are not required to be provided exactly as (A). They only need to be sufficient to ensure that for their argument `num` of integer type, `std::sinh(num)` has the same effect as `std::sinh(static_cast<double>(num))`.

## Example

```cpp
#include <cerrno>
#include <cfenv>
#include <cmath>
#include <cstring>
#include <iostream>
// #pragma STDC FENV_ACCESS ON

int main()
{
    const double x = 42;

    std::cout << "sinh(1) = " << std::sinh(1) << '\n'
              << "sinh(-1) = " << std::sinh(-1) << '\n'
              << "log(sinh(" << x << ")+cosh(" << x << ")) = "
              << std::log(std::sinh(x) + std::cosh(x)) << '\n';

    // special values
    std::cout << "sinh(+0) = " << std::sinh(0.0) << '\n'
              << "sinh(-0) = " << std::sinh(-0.0) << '\n';

    // error handling
    errno = 0;
    std::feclearexcept(FE_ALL_EXCEPT);

    std::cout << "sinh(710.5) = " << std::sinh(710.5) << '\n';

    if (errno == ERANGE)
        std::cout << "    errno == ERANGE: " << std::strerror(errno) << '\n';
    if (std::fetestexcept(FE_OVERFLOW))
        std::cout << "    FE_OVERFLOW raised\n";
}
```

Output:

```text
sinh(1) = 1.1752
sinh(-1) = -1.1752
log(sinh(42)+cosh(42)) = 42
sinh(+0) = 0
sinh(-0) = -0
sinh(710.5) = inf
    errno == ERANGE: Numerical result out of range
    FE_OVERFLOW raised
```

## See also

- [`cosh`](https://en.cppreference.com/w/cpp/numeric/math/cosh), [`coshf`](https://en.cppreference.com/w/cpp/numeric/math/cosh) (C++11), [`coshl`](https://en.cppreference.com/w/cpp/numeric/math/cosh) (C++11): computes hyperbolic cosine (cosh(x)) (function)
- [`tanh`](https://en.cppreference.com/w/cpp/numeric/math/tanh), [`tanhf`](https://en.cppreference.com/w/cpp/numeric/math/tanh) (C++11), [`tanhl`](https://en.cppreference.com/w/cpp/numeric/math/tanh) (C++11): computes hyperbolic tangent (tanh(x)) (function)
- [`asinh`](https://en.cppreference.com/w/cpp/numeric/math/asinh) (C++11), [`asinhf`](https://en.cppreference.com/w/cpp/numeric/math/asinh) (C++11), [`asinhl`](https://en.cppreference.com/w/cpp/numeric/math/asinh) (C++11): computes the inverse hyperbolic sine (arsinh(x)) (function)
- [`sinh(std::complex)`](https://en.cppreference.com/w/cpp/numeric/complex/sinh): computes hyperbolic sine of a complex number (sinh(z)) (function template)
- [`sinh(std::valarray)`](https://en.cppreference.com/w/cpp/numeric/valarray/sinh): applies the function `std::sinh` to each element of valarray (function template)
- [C documentation for `sinh`](https://en.cppreference.com/w/c/numeric/math/sinh)
