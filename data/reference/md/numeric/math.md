# Common mathematical functions

Source: https://en.cppreference.com/w/cpp/numeric/math

## Functions

Defined in header `<cstdlib>`

- `abs(int)`, `labs`, `llabs` (C++11): computes absolute value of an integral value (|x|) (function)
- `div(int)`, `ldiv`, `lldiv` (C++11): computes quotient and remainder of integer division (function)

Defined in header `<cinttypes>`

- `abs(std::intmax_t)` (C++11), `imaxabs` (C++11): computes absolute value of an integral value (|x|) (function)
- `div(std::intmax_t)` (C++11), `imaxdiv` (C++11): computes quotient and remainder of integer division (function)

Defined in header `<cmath>`

**Basic operations**

- `abs(float)`, `fabs`, `fabsf` (C++11), `fabsl` (C++11): absolute value of a floating point value (|x|) (function)
- `fmod`, `fmodf` (C++11), `fmodl` (C++11): remainder of the floating point division operation (function)
- `remainder` (C++11), `remainderf` (C++11), `remainderl` (C++11): signed remainder of the division operation (function)
- `remquo` (C++11), `remquof` (C++11), `remquol` (C++11): signed remainder as well as the three last bits of the division operation (function)
- `fma` (C++11), `fmaf` (C++11), `fmal` (C++11): fused multiply-add operation (function)
- `fmax` (C++11), `fmaxf` (C++11), `fmaxl` (C++11): larger of two floating-point values (function)
- `fmin` (C++11), `fminf` (C++11), `fminl` (C++11): smaller of two floating point values (function)
- `fdim` (C++11), `fdimf` (C++11), `fdiml` (C++11): positive difference of two floating point values (max(0, x-y)) (function)
- `nan` (C++11), `nanf` (C++11), `nanl` (C++11): not-a-number (NaN) (function)

**Exponential functions**

- `exp`, `expf` (C++11), `expl` (C++11): returns e raised to the given power (ex) (function)
- `exp2` (C++11), `exp2f` (C++11), `exp2l` (C++11): returns 2 raised to the given power (2x) (function)
- `expm1` (C++11), `expm1f` (C++11), `expm1l` (C++11): returns e raised to the given power, minus 1 (ex-1) (function)
- `log`, `logf` (C++11), `logl` (C++11): computes natural (base e) logarithm (ln(x)) (function)
- `log10`, `log10f` (C++11), `log10l` (C++11): computes common (base 10) logarithm (log₁₀(x)) (function)
- `log2` (C++11), `log2f` (C++11), `log2l` (C++11): base 2 logarithm of the given number (log₂(x)) (function)
- `log1p` (C++11), `log1pf` (C++11), `log1pl` (C++11): natural logarithm (to base e) of 1 plus the given number (ln(1+x)) (function)

**Power functions**

- `pow`, `powf` (C++11), `powl` (C++11): raises a number to the given power (xy) (function)
- `sqrt`, `sqrtf` (C++11), `sqrtl` (C++11): computes square root (√x) (function)
- `cbrt` (C++11), `cbrtf` (C++11), `cbrtl` (C++11): computes cube root (3√x) (function)
- `hypot` (C++11), `hypotf` (C++11), `hypotl` (C++11): computes hypotenuse √x²+y² and √x²+y²+z² (since C++17) (function)

**Trigonometric functions**

- `sin`, `sinf` (C++11), `sinl` (C++11): computes sine (sin(x)) (function)
- `cos`, `cosf` (C++11), `cosl` (C++11): computes cosine (cos(x)) (function)
- `tan`, `tanf` (C++11), `tanl` (C++11): computes tangent (tan(x)) (function)
- `asin`, `asinf` (C++11), `asinl` (C++11): computes arc sine (arcsin(x)) (function)
- `acos`, `acosf` (C++11), `acosl` (C++11): computes arc cosine (arccos(x)) (function)
- `atan`, `atanf` (C++11), `atanl` (C++11): computes arc tangent (arctan(x)) (function)
- `atan2`, `atan2f` (C++11), `atan2l` (C++11): arc tangent, using signs to determine quadrants (function)

**Hyperbolic functions**

- `sinh`, `sinhf` (C++11), `sinhl` (C++11): computes hyperbolic sine (sinh(x)) (function)
- `cosh`, `coshf` (C++11), `coshl` (C++11): computes hyperbolic cosine (cosh(x)) (function)
- `tanh`, `tanhf` (C++11), `tanhl` (C++11): computes hyperbolic tangent (tanh(x)) (function)
- `asinh` (C++11), `asinhf` (C++11), `asinhl` (C++11): computes the inverse hyperbolic sine (arsinh(x)) (function)
- `acosh` (C++11), `acoshf` (C++11), `acoshl` (C++11): computes the inverse hyperbolic cosine (arcosh(x)) (function)
- `atanh` (C++11), `atanhf` (C++11), `atanhl` (C++11): computes the inverse hyperbolic tangent (artanh(x)) (function)

**Error and gamma functions**

- `erf` (C++11), `erff` (C++11), `erfl` (C++11): error function (function)
- `erfc` (C++11), `erfcf` (C++11), `erfcl` (C++11): complementary error function (function)
- `tgamma` (C++11), `tgammaf` (C++11), `tgammal` (C++11): gamma function (function)
- `lgamma` (C++11), `lgammaf` (C++11), `lgammal` (C++11): natural logarithm of the gamma function (function)

**Nearest integer floating point operations**

- `ceil`, `ceilf` (C++11), `ceill` (C++11): nearest integer not less than the given value (function)
- `floor`, `floorf` (C++11), `floorl` (C++11): nearest integer not greater than the given value (function)
- `trunc` (C++11), `truncf` (C++11), `truncl` (C++11): nearest integer not greater in magnitude than the given value (function)
- `round` (C++11), `roundf` (C++11), `roundl` (C++11), `lround` (C++11), `lroundf` (C++11), `lroundl` (C++11), `llround` (C++11), `llroundf` (C++11), `llroundl` (C++11): nearest integer, rounding away from zero in halfway cases (function)
- `nearbyint` (C++11), `nearbyintf` (C++11), `nearbyintl` (C++11): nearest integer using current rounding mode (function)
- `rint` (C++11), `rintf` (C++11), `rintl` (C++11), `lrint` (C++11), `lrintf` (C++11), `lrintl` (C++11), `llrint` (C++11), `llrintf` (C++11), `llrintl` (C++11): nearest integer using current rounding mode with exception if the result differs (function)

**Floating point manipulation functions**

- `frexp`, `frexpf` (C++11), `frexpl` (C++11): decomposes a number into significand and base-2 exponent (function)
- `ldexp`, `ldexpf` (C++11), `ldexpl` (C++11): multiplies a number by 2 raised to an integral power (function)
- `modf`, `modff` (C++11), `modfl` (C++11): decomposes a number into integer and fractional parts (function)
- `scalbn` (C++11), `scalbnf` (C++11), `scalbnl` (C++11), `scalbln` (C++11), `scalblnf` (C++11), `scalblnl` (C++11): multiplies a number by `FLT_RADIX` raised to a power (function)
- `ilogb` (C++11), `ilogbf` (C++11), `ilogbl` (C++11): extracts exponent of the number (function)
- `logb` (C++11), `logbf` (C++11), `logbl` (C++11): extracts exponent of the number (function)
- `nextafter` (C++11), `nextafterf` (C++11), `nextafterl` (C++11), `nexttoward` (C++11), `nexttowardf` (C++11), `nexttowardl` (C++11): next representable floating-point value towards the given value (function)
- `copysign` (C++11), `copysignf` (C++11), `copysignl` (C++11): copies the sign of a floating point value (function)

**Classification and comparison**

- `fpclassify` (C++11): categorizes the given floating-point value (function)
- `isfinite` (C++11): checks if the given number has finite value (function)
- `isinf` (C++11): checks if the given number is infinite (function)
- `isnan` (C++11): checks if the given number is NaN (function)
- `isnormal` (C++11): checks if the given number is normal (function)
- `signbit` (C++11): checks if the given number is negative (function)
- `isgreater` (C++11): checks if the first floating-point argument is greater than the second (function)
- `isgreaterequal` (C++11): checks if the first floating-point argument is greater or equal than the second (function)
- `isless` (C++11): checks if the first floating-point argument is less than the second (function)
- `islessequal` (C++11): checks if the first floating-point argument is less or equal than the second (function)
- `islessgreater` (C++11): checks if the first floating-point argument is less or greater than the second (function)
- `isunordered` (C++11): checks if two floating-point values are unordered (function)

## Types

Defined in header `<cstdlib>`

- `div_t`: structure type, returned by `std::div` (typedef)
- `ldiv_t`: structure type, returned by `std::ldiv` (typedef)
- `lldiv_t` (C++11): structure type, returned by `std::lldiv` (typedef)

Defined in header `<cinttypes>`

- `imaxdiv_t` (C++11): structure type, returned by `std::imaxdiv` (typedef)

Defined in header `<cmath>`

- `float_t` (C++11): most efficient floating-point type at least as wide as `float` (typedef)
- `double_t` (C++11): most efficient floating-point type at least as wide as `double` (typedef)

## Macro constants

Defined in header `<cmath>`

- `HUGE_VALF` (C++11), `HUGE_VAL`, `HUGE_VALL` (C++11): indicates the overflow value for `float`, `double` and `long double` respectively (macro constant)
- `INFINITY` (C++11): evaluates to positive infinity or the value guaranteed to overflow a `float` (macro constant)
- `NAN` (C++11): evaluates to a quiet NaN of type `float` (macro constant)
- `math_errhandling` (C++11), `MATH_ERRNO` (C++11), `MATH_ERREXCEPT` (C++11): defines the error handling mechanism used by the common mathematical functions (macro constant)

**Classification**

- `FP_NORMAL` (C++11), `FP_SUBNORMAL` (C++11), `FP_ZERO` (C++11), `FP_INFINITE` (C++11), `FP_NAN` (C++11): indicates a floating-point category (macro constant)

## Notes

| Feature-test macro | Value | Std | Feature |
| --- | --- | --- | --- |
| `__cpp_lib_constexpr_cmath` | `202202L` | (C++23) | Constexpr for FP environment agnostic mathematical functions in `<cmath>` and `<cstdlib>` |
| `__cpp_lib_constexpr_cmath` | `202306L` | (C++26) | Constexpr for most mathematical functions in `<cmath>` |

## See also

- [**Mathematical special functions**](https://en.cppreference.com/w/cpp/numeric/special_functions)
- [C documentation for Common mathematical functions](https://en.cppreference.com/w/c/numeric/math)
