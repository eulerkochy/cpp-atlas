# Common mathematical functions

Source: https://en.cppreference.com/w/c/numeric/math

## Types

Defined in header `<stdlib.h>`

- `div_t`: structure type, return of the `div` function (typedef)
- `ldiv_t`: structure type, return of the `ldiv` function (typedef)
- `lldiv_t` (C99): structure type, return of the `lldiv` function (typedef)

Defined in header `<inttypes.h>`

- `imaxdiv_t` (C99): structure type, return of the `imaxdiv` function (typedef)

Defined in header `<math.h>`

- `float_t` (C99): most efficient floating-point type at least as wide as `float` (typedef)
- `double_t` (C99): most efficient floating-point type at least as wide as `double` (typedef)

## Constants

Defined in header `<math.h>`

- `HUGE_VALF` (C99), `HUGE_VAL`, `HUGE_VALL` (C99): indicates value too big to be representable (infinity) by `float`, `double` and `long double` respectively (macro constant)
- `INFINITY` (C99): evaluates to positive infinity or the value guaranteed to overflow a `float` (macro constant)
- `NAN` (C99): evaluates to a quiet NaN of type `float` (macro constant)
- `FP_FAST_FMAF` (C99), `FP_FAST_FMA` (C99), `FP_FAST_FMAL` (C99): indicates that the fma function generally executes about as fast as, or faster than, a multiply and an add of double operands (macro constant)
- `FP_ILOGB0` (C99), `FP_ILOGBNAN` (C99): evaluates to `ilogb(x)` if x is zero or NaN, respectively (macro constant)
- `math_errhandling` (C99), `MATH_ERRNO` (C99), `MATH_ERREXCEPT` (C99): defines the error handling mechanism used by the common mathematical functions (macro constant)

**Classification**

- `FP_NORMAL` (C99), `FP_SUBNORMAL` (C99), `FP_ZERO` (C99), `FP_INFINITE` (C99), `FP_NAN` (C99): indicates a floating-point category (macro constant)

## Functions

Defined in header `<stdlib.h>`

- `abs`, `labs`, `llabs` (C99): computes absolute value of an integral value (|x|) (function)
- `div`, `ldiv`, `lldiv` (C99): computes quotient and remainder of integer division (function)

Defined in header `<inttypes.h>`

- `imaxabs` (C99): computes absolute value of an integral value (|x|) (function)
- `imaxdiv` (C99): computes quotient and remainder of integer division (function)

Defined in header `<math.h>`

**Basic operations**

- `fabs`, `fabsf` (C99), `fabsl` (C99): computes absolute value of a floating-point value (|x|) (function)
- `fmod`, `fmodf` (C99), `fmodl` (C99): computes remainder of the floating-point division operation (function)
- `remainder` (C99), `remainderf` (C99), `remainderl` (C99): computes signed remainder of the floating-point division operation (function)
- `remquo` (C99), `remquof` (C99), `remquol` (C99): computes signed remainder as well as the three last bits of the division operation (function)
- `fma` (C99), `fmaf` (C99), `fmal` (C99): computes fused multiply-add operation (function)
- `fmax` (C99), `fmaxf` (C99), `fmaxl` (C99): determines larger of two floating-point values (function)
- `fmin` (C99), `fminf` (C99), `fminl` (C99): determines smaller of two floating-point values (function)
- `fdim` (C99), `fdimf` (C99), `fdiml` (C99): determines positive difference of two floating-point values (max(0, x-y)) (function)
- `nan` (C99), `nanf` (C99), `nanl` (C99): returns a NaN (not-a-number) (function)

**Exponential functions**

- `exp`, `expf` (C99), `expl` (C99): computes *e* raised to the given power (ex) (function)
- `exp2` (C99), `exp2f` (C99), `exp2l` (C99): computes *2* raised to the given power (2x) (function)
- `expm1` (C99), `expm1f` (C99), `expm1l` (C99): computes *e* raised to the given power, minus one (ex-1) (function)
- `log`, `logf` (C99), `logl` (C99): computes natural (base-*e*) logarithm (ln(x)) (function)
- `log10`, `log10f` (C99), `log10l` (C99): computes common (base-*10*) logarithm (log₁₀(x)) (function)
- `log2` (C99), `log2f` (C99), `log2l` (C99): computes base-2 logarithm (log₂(x)) (function)
- `log1p` (C99), `log1pf` (C99), `log1pl` (C99): computes natural (base-*e*) logarithm of 1 plus the given number (ln(1+x)) (function)

**Power functions**

- `pow`, `powf` (C99), `powl` (C99): computes a number raised to the given power (xy) (function)
- `sqrt`, `sqrtf` (C99), `sqrtl` (C99): computes square root (√x) (function)
- `cbrt` (C99), `cbrtf` (C99), `cbrtl` (C99): computes cube root (3√x) (function)
- `hypot` (C99), `hypotf` (C99), `hypotl` (C99): computes square root of the sum of the squares of two given numbers (√x²+y²) (function)

**Trigonometric functions**

- `sin`, `sinf` (C99), `sinl` (C99): computes sine (sin(x)) (function)
- `cos`, `cosf` (C99), `cosl` (C99): computes cosine (cos(x)) (function)
- `tan`, `tanf` (C99), `tanl` (C99): computes tangent (tan(x)) (function)
- `asin`, `asinf` (C99), `asinl` (C99): computes arc sine (arcsin(x)) (function)
- `acos`, `acosf` (C99), `acosl` (C99): computes arc cosine (arccos(x)) (function)
- `atan`, `atanf` (C99), `atanl` (C99): computes arc tangent (arctan(x)) (function)
- `atan2`, `atan2f` (C99), `atan2l` (C99): computes arc tangent, using signs to determine quadrants (function)

**Hyperbolic functions**

- `sinh`, `sinhf` (C99), `sinhl` (C99): computes hyperbolic sine (sinh(x)) (function)
- `cosh`, `coshf` (C99), `coshl` (C99): computes hyperbolic cosine (cosh(x)) (function)
- `tanh`, `tanhf` (C99), `tanhl` (C99): computes hyperbolic tangent (tanh(x)) (function)
- `asinh` (C99), `asinhf` (C99), `asinhl` (C99): computes inverse hyperbolic sine (arsinh(x)) (function)
- `acosh` (C99), `acoshf` (C99), `acoshl` (C99): computes inverse hyperbolic cosine (arcosh(x)) (function)
- `atanh` (C99), `atanhf` (C99), `atanhl` (C99): computes inverse hyperbolic tangent (artanh(x)) (function)

**Error and gamma functions**

- `erf` (C99), `erff` (C99), `erfl` (C99): computes error function (function)
- `erfc` (C99), `erfcf` (C99), `erfcl` (C99): computes complementary error function (function)
- `tgamma` (C99), `tgammaf` (C99), `tgammal` (C99): computes gamma function (function)
- `lgamma` (C99), `lgammaf` (C99), `lgammal` (C99): computes natural (base-*e*) logarithm of the gamma function (function)

**Nearest integer floating-point operations**

- `ceil`, `ceilf` (C99), `ceill` (C99): computes smallest integer not less than the given value (function)
- `floor`, `floorf` (C99), `floorl` (C99): computes largest integer not greater than the given value (function)
- `trunc` (C99), `truncf` (C99), `truncl` (C99): rounds to nearest integer not greater in magnitude than the given value (function)
- `round` (C99), `roundf` (C99), `roundl` (C99), `lround` (C99), `lroundf` (C99), `lroundl` (C99), `llround` (C99), `llroundf` (C99), `llroundl` (C99): rounds to nearest integer, rounding away from zero in halfway cases (function)
- `nearbyint` (C99), `nearbyintf` (C99), `nearbyintl` (C99): rounds to an integer using current rounding mode (function)
- `rint` (C99), `rintf` (C99), `rintl` (C99), `lrint` (C99), `lrintf` (C99), `lrintl` (C99), `llrint` (C99), `llrintf` (C99), `llrintl` (C99): rounds to an integer using current rounding mode with exception if the result differs (function)

**Floating-point manipulation functions**

- `frexp`, `frexpf` (C99), `frexpl` (C99): breaks a number into significand and a power of 2 (function)
- `ldexp`, `ldexpf` (C99), `ldexpl` (C99): multiplies a number by 2 raised to a power (function)
- `modf`, `modff` (C99), `modfl` (C99): breaks a number into integer and fractional parts (function)
- `scalbn` (C99), `scalbnf` (C99), `scalbnl` (C99), `scalbln` (C99), `scalblnf` (C99), `scalblnl` (C99): computes efficiently a number times `FLT_RADIX` raised to a power (function)
- `ilogb` (C99), `ilogbf` (C99), `ilogbl` (C99): extracts exponent of the given number (function)
- `logb` (C99), `logbf` (C99), `logbl` (C99): extracts exponent of the given number (function)
- `nextafter` (C99), `nextafterf` (C99), `nextafterl` (C99), `nexttoward` (C99), `nexttowardf` (C99), `nexttowardl` (C99): determines next representable floating-point value towards the given value (function)
- `copysign` (C99), `copysignf` (C99), `copysignl` (C99): produces a value with the magnitude of a given value and the sign of another given value (function)

**Classification and comparison**

- `fpclassify` (C99): classifies the given floating-point value (function macro)
- `isfinite` (C99): checks if the given number has finite value (function macro)
- `isinf` (C99): checks if the given number is infinite (function macro)
- `isnan` (C99): checks if the given number is NaN (function macro)
- `isnormal` (C99): checks if the given number is normal (function macro)
- `signbit` (C99): checks if the given number is negative (function macro)
- `isgreater` (C99): checks if the first floating-point argument is greater than the second (function macro)
- `isgreaterequal` (C99): checks if the first floating-point argument is greater or equal than the second (function macro)
- `isless` (C99): checks if the first floating-point argument is less than the second (function macro)
- `islessequal` (C99): checks if the first floating-point argument is less or equal than the second (function macro)
- `islessgreater` (C99): checks if the first floating-point argument is less or greater than the second (function macro)
- `isunordered` (C99): checks if two floating-point values are unordered (function macro)

## References

- C23 standard (ISO/IEC 9899:2024):

  - 7.8 Format conversion of integer types \<inttypes.h> (p: TBD)

  - 7.12 Mathematics \<math.h> (p: TBD)

  - 7.22 General utilities \<stdlib.h> (p: TBD)

  - 7.31.5 Format conversion of integer types \<inttypes.h> (p: TBD)

  - 7.31.12 General utilities \<stdlib.h> (p: TBD)

- C17 standard (ISO/IEC 9899:2018):

  - 7.8 Format conversion of integer types \<inttypes.h> (p: 158-160)

  - 7.12 Mathematics \<math.h> (p: 169-190)

  - 7.22 General utilities \<stdlib.h> (p: 248-262)

  - 7.31.5 Format conversion of integer types \<inttypes.h> (p: 332)

  - 7.31.12 General utilities \<stdlib.h> (p: 333)

- C11 standard (ISO/IEC 9899:2011):

  - 7.8 Format conversion of integer types \<inttypes.h> (p: 217-220)

  - 7.12 Mathematics \<math.h> (p: 231-261)

  - 7.22 General utilities \<stdlib.h> (p: 340-360)

  - 7.31.5 Format conversion of integer types \<inttypes.h> (p: 455)

  - 7.31.12 General utilities \<stdlib.h> (p: 456)

- C99 standard (ISO/IEC 9899:1999):

  - 7.8 Format conversion of integer types \<inttypes.h> (p: 198-201)

  - 7.12 Mathematics \<math.h> (p: 212-242)

  - 7.20 General utilities \<stdlib.h> (p: 306-324)

  - 7.26.4 Format conversion of integer types \<inttypes.h> (p: 401)

  - 7.26.10 General utilities \<stdlib.h> (p: 402)

- C89/C90 standard (ISO/IEC 9899:1990):

  - 4.5 MATHEMATICS \<math.h>

  - 4.10 GENERAL UTILITIES \<stdlib.h>

  - 4.13.4 Mathematics \<math.h>

  - 7.13.7 General utilities \<stdlib.h>

## See also

- [C++ documentation for Common mathematical functions](https://en.cppreference.com/w/cpp/numeric/math)
