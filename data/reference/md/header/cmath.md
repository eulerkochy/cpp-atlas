# Standard library header <cmath>

Source: https://en.cppreference.com/w/cpp/header/cmath

This header was originally in the C standard library as `<math.h>`.

This header is part of the numeric library.

**Types**

- `float_t` (C++11): most efficient floating-point type at least as wide as `float` (typedef)
- `double_t` (C++11): most efficient floating-point type at least as wide as `double` (typedef)

**Macros**

- `HUGE_VALF` (C++11), `HUGE_VAL`, `HUGE_VALL` (C++11): indicates the overflow value for `float`, `double` and `long double` respectively (macro constant)
- `INFINITY` (C++11): evaluates to positive infinity or the value guaranteed to overflow a `float` (macro constant)
- `NAN` (C++11): evaluates to a quiet NaN of type `float` (macro constant)
- `math_errhandling` (C++11), `MATH_ERRNO` (C++11), `MATH_ERREXCEPT` (C++11): defines the error handling mechanism used by the common mathematical functions (macro constant)

**Classification**

- `FP_NORMAL` (C++11), `FP_SUBNORMAL` (C++11), `FP_ZERO` (C++11), `FP_INFINITE` (C++11), `FP_NAN` (C++11): indicates a floating-point category (macro constant)

**Functions**

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

**Linear interpolation**

- `lerp` (C++20): linear interpolation function (function)

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

**Nearest integer floating-point operations**

- `ceil`, `ceilf` (C++11), `ceill` (C++11): nearest integer not less than the given value (function)
- `floor`, `floorf` (C++11), `floorl` (C++11): nearest integer not greater than the given value (function)
- `trunc` (C++11), `truncf` (C++11), `truncl` (C++11): nearest integer not greater in magnitude than the given value (function)
- `round` (C++11), `roundf` (C++11), `roundl` (C++11), `lround` (C++11), `lroundf` (C++11), `lroundl` (C++11), `llround` (C++11), `llroundf` (C++11), `llroundl` (C++11): nearest integer, rounding away from zero in halfway cases (function)
- `nearbyint` (C++11), `nearbyintf` (C++11), `nearbyintl` (C++11): nearest integer using current rounding mode (function)
- `rint` (C++11), `rintf` (C++11), `rintl` (C++11), `lrint` (C++11), `lrintf` (C++11), `lrintl` (C++11), `llrint` (C++11), `llrintf` (C++11), `llrintl` (C++11): nearest integer using current rounding mode with exception if the result differs (function)

**Floating-point manipulation functions**

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

**Mathematical special functions**

- `assoc_laguerre` (C++17), `assoc_laguerref` (C++17), `assoc_laguerrel` (C++17): associated Laguerre polynomials (function)
- `assoc_legendre` (C++17), `assoc_legendref` (C++17), `assoc_legendrel` (C++17): associated Legendre polynomials (function)
- `beta` (C++17), `betaf` (C++17), `betal` (C++17): beta function (function)
- `comp_ellint_1` (C++17), `comp_ellint_1f` (C++17), `comp_ellint_1l` (C++17): (complete) elliptic integral of the first kind (function)
- `comp_ellint_2` (C++17), `comp_ellint_2f` (C++17), `comp_ellint_2l` (C++17): (complete) elliptic integral of the second kind (function)
- `comp_ellint_3` (C++17), `comp_ellint_3f` (C++17), `comp_ellint_3l` (C++17): (complete) elliptic integral of the third kind (function)
- `cyl_bessel_i` (C++17), `cyl_bessel_if` (C++17), `cyl_bessel_il` (C++17): regular modified cylindrical Bessel functions (function)
- `cyl_bessel_j` (C++17), `cyl_bessel_jf` (C++17), `cyl_bessel_jl` (C++17): cylindrical Bessel functions (of the first kind) (function)
- `cyl_bessel_k` (C++17), `cyl_bessel_kf` (C++17), `cyl_bessel_kl` (C++17): irregular modified cylindrical Bessel functions (function)
- `cyl_neumann` (C++17), `cyl_neumannf` (C++17), `cyl_neumannl` (C++17): cylindrical Neumann functions (function)
- `ellint_1` (C++17), `ellint_1f` (C++17), `ellint_1l` (C++17): (incomplete) elliptic integral of the first kind (function)
- `ellint_2` (C++17), `ellint_2f` (C++17), `ellint_2l` (C++17): (incomplete) elliptic integral of the second kind (function)
- `ellint_3` (C++17), `ellint_3f` (C++17), `ellint_3l` (C++17): (incomplete) elliptic integral of the third kind (function)
- `expint` (C++17), `expintf` (C++17), `expintl` (C++17): exponential integral (function)
- `hermite` (C++17), `hermitef` (C++17), `hermitel` (C++17): Hermite polynomials (function)
- `legendre` (C++17), `legendref` (C++17), `legendrel` (C++17): Legendre polynomials (function)
- `laguerre` (C++17), `laguerref` (C++17), `laguerrel` (C++17): Laguerre polynomials (function)
- `riemann_zeta` (C++17), `riemann_zetaf` (C++17), `riemann_zetal` (C++17): Riemann zeta function (function)
- `sph_bessel` (C++17), `sph_besself` (C++17), `sph_bessell` (C++17): spherical Bessel functions (of the first kind) (function)
- `sph_legendre` (C++17), `sph_legendref` (C++17), `sph_legendrel` (C++17): spherical associated Legendre functions (function)
- `sph_neumann` (C++17), `sph_neumannf` (C++17), `sph_neumannl` (C++17): spherical Neumann functions (function)

## Synopsis

For each function with at least one parameter of type `/* floating-point-type */`, an overload for each cv-unqualified floating-point type is provided where all uses of `/* floating-point-type */` in the function signature are replaced with that floating-point type.

For each function with at least one parameter of type `/* floating-point-type */` other than `std::abs`, additional overloads are provided to ensure that, if every argument corresponding to a `/* floating-point-type */` parameter has arithmetic type, then every such argument is effectively cast to the floating-point type with the greatest floating-point conversion rank and greatest floating-point conversion subrank among the types of all such arguments, where arguments of integer type are considered to have the same floating-point conversion rank as `double`. If no such floating-point type with the greatest rank and subrank exists, then overload resolution does not result in a usable candidate from the provided overloads.

```cpp
namespace std {
  using float_t = /* see description */;
  using double_t = /* see description */;
}

#define HUGE_VAL /* see description */
#define HUGE_VALF /* see description */
#define HUGE_VALL /* see description */
#define INFINITY /* see description */
#define NAN /* see description */
#define FP_INFINITE /* see description */
#define FP_NAN /* see description */
#define FP_NORMAL /* see description */
#define FP_SUBNORMAL /* see description */
#define FP_ZERO /* see description */
#define FP_FAST_FMA /* see description */
#define FP_FAST_FMAF /* see description */
#define FP_FAST_FMAL /* see description */
#define FP_ILOGB0 /* see description */
#define FP_ILOGBNAN /* see description */
#define MATH_ERRNO /* see description */
#define MATH_ERREXCEPT /* see description */

#define math_errhandling /* see description */

namespace std {
  /* floating-point-type */ acos(/* floating-point-type */ x);
  float acosf(float x);
  long double acosl(long double x);

  /* floating-point-type */ asin(/* floating-point-type */ x);
  float asinf(float x);
  long double asinl(long double x);

  /* floating-point-type */ atan(/* floating-point-type */ x);
  float atanf(float x);
  long double atanl(long double x);

  /* floating-point-type */ atan2(/* floating-point-type */ y,
                                  /* floating-point-type */ x);
  float atan2f(float y, float x);
  long double atan2l(long double y, long double x);

  /* floating-point-type */ cos(/* floating-point-type */e x);
  float cosf(float x);
  long double cosl(long double x);

  /* floating-point-type */ sin(/* floating-point-type */ x);
  float sinf(float x);
  long double sinl(long double x);

  /* floating-point-type */ tan(/* floating-point-type */ x);
  float tanf(float x);
  long double tanl(long double x);

  /* floating-point-type */ acosh(/* floating-point-type */ x);
  float acoshf(float x);
  long double acoshl(long double x);

  /* floating-point-type */ asinh(/* floating-point-type */ x);
  float asinhf(float x);
  long double asinhl(long double x);

  /* floating-point-type */ atanh(/* floating-point-type */ x);
  float atanhf(float x);
  long double atanhl(long double x);

  /* floating-point-type */ cosh(/* floating-point-type */ x);
  float coshf(float x);
  long double coshl(long double x);

  /* floating-point-type */ sinh(/* floating-point-type */ x);
  float sinhf(float x);
  long double sinhl(long double x);

  /* floating-point-type */ tanh(/* floating-point-type */ x);
  float tanhf(float x);
  long double tanhl(long double x);

  /* floating-point-type */ exp(/* floating-point-type */ x);
  float expf(float x);
  long double expl(long double x);

  /* floating-point-type */ exp2(/* floating-point-type */ x);
  float exp2f(float x);
  long double exp2l(long double x);

  /* floating-point-type */ expm1(/* floating-point-type */ x);
  float expm1f(float x);
  long double expm1l(long double x);

  constexpr /* floating-point-type */ frexp(/* floating-point-type */ value, int* exp);
  constexpr float frexpf(float value, int* exp);
  constexpr long double frexpl(long double value, int* exp);

  constexpr int ilogb(/* floating-point-type */ x);
  constexpr int ilogbf(float x);
  constexpr int ilogbl(long double x);

  constexpr /* floating-point-type */ ldexp(/* floating-point-type */ x, int exp);
  constexpr float ldexpf(float x, int exp);
  constexpr long double ldexpl(long double x, int exp);

  /* floating-point-type */ log(/* floating-point-type */ x);
  float logf(float x);
  long double logl(long double x);

  /* floating-point-type */ log10(/* floating-point-type */ x);
  float log10f(float x);
  long double log10l(long double x);

  /* floating-point-type */ log1p(/* floating-point-type */ x);
  float log1pf(float x);
  long double log1pl(long double x);

  /* floating-point-type */ log2(/* floating-point-type */ x);
  float log2f(float x);
  long double log2l(long double x);

  constexpr /* floating-point-type */ logb(/* floating-point-type */ x);
  constexpr float logbf(float x);
  constexpr long double logbl(long double x);

  constexpr /* floating-point-type */ modf(/* floating-point-type */ value,
                                           /* floating-point-type */* iptr);
  constexpr float modff(float value, float* iptr);
  constexpr long double modfl(long double value, long double* iptr);

  constexpr /* floating-point-type */ scalbn(/* floating-point-type */ x, int n);
  constexpr float scalbnf(float x, int n);
  constexpr long double scalbnl(long double x, int n);

  constexpr /* floating-point-type */ scalbln(/* floating-point-type */ x, long int n);
  constexpr float scalblnf(float x, long int n);
  constexpr long double scalblnl(long double x, long int n);

  /* floating-point-type */ cbrt(/* floating-point-type */ x);
  float cbrtf(float x);
  long double cbrtl(long double x);

  // absolute values
  constexpr int abs(int j);                     // freestanding
  constexpr long int abs(long int j);           // freestanding
  constexpr long long int abs(long long int j); // freestanding
  constexpr /* floating-point-type */
    abs(/* floating-point-type */ j);           // freestanding-deleted

  constexpr /* floating-point-type */ fabs(/* floating-point-type */ x);
  constexpr float fabsf(float x);
  constexpr long double fabsl(long double x);

  /* floating-point-type */ hypot(/* floating-point-type */ x,
                                  /* floating-point-type */ y);
  float hypotf(float x, float y);
  long double hypotl(long double x, long double y);

  // three-dimensional hypotenuse
  float hypot(/* floating-point-type */ x,
              /* floating-point-type */ y,
              /* floating-point-type */ z);

  /* floating-point-type */ pow(/* floating-point-type */ x,
                                /* floating-point-type */ y);
  float powf(float x, float y);
  long double powl(long double x, long double y);

  /* floating-point-type */ sqrt(/* floating-point-type */ x);
  float sqrtf(float x);
  long double sqrtl(long double x);

  /* floating-point-type */ erf(/* floating-point-type */ x);
  float erff(float x);
  long double erfl(long double x);

  /* floating-point-type */ erfc(/* floating-point-type */ x);
  float erfcf(float x);
  long double erfcl(long double x);

  /* floating-point-type */ lgamma(/* floating-point-type */ x);
  float lgammaf(float x);
  long double lgammal(long double x);

  /* floating-point-type */ tgamma(/* floating-point-type */ x);
  float tgammaf(float x);
  long double tgammal(long double x);

  constexpr /* floating-point-type */ ceil(/* floating-point-type */ x);
  constexpr float ceilf(float x);
  constexpr long double ceill(long double x);

  constexpr /* floating-point-type */ floor(/* floating-point-type */ x);
  constexpr float floorf(float x);
  constexpr long double floorl(long double x);

  /* floating-point-type */ nearbyint(/* floating-point-type */ x);
  float nearbyintf(float x);
  long double nearbyintl(long double x);

  /* floating-point-type */ rint(/* floating-point-type */ x);
  float rintf(float x);
  long double rintl(long double x);

  long int lrint(/* floating-point-type */ x);
  long int lrintf(float x);
  long int lrintl(long double x);

  long long int llrint(/* floating-point-type */ x);
  long long int llrintf(float x);
  long long int llrintl(long double x);

  constexpr /* floating-point-type */ round(/* floating-point-type */ x);
  constexpr float roundf(float x);
  constexpr long double roundl(long double x);

  constexpr long int lround(/* floating-point-type */ x);
  constexpr long int lroundf(float x);
  constexpr long int lroundl(long double x);

  constexpr long long int llround(/* floating-point-type */ x);
  constexpr long long int llroundf(float x);
  constexpr long long int llroundl(long double x);

  constexpr /* floating-point-type */ trunc(/* floating-point-type */ x);
  constexpr float truncf(float x);
  constexpr long double truncl(long double x);

  constexpr /* floating-point-type */ fmod(/* floating-point-type */ x,
                                           /* floating-point-type */ y);
  constexpr float fmodf(float x, float y);
  constexpr long double fmodl(long double x, long double y);

  constexpr /* floating-point-type */ remainder(/* floating-point-type */ x,
                                                /* floating-point-type */ y);
  constexpr float remainderf(float x, float y);
  constexpr long double remainderl(long double x, long double y);

  constexpr /* floating-point-type */ remquo(/* floating-point-type */ x,
                                             /* floating-point-type */ y, int* quo);
  constexpr float remquof(float x, float y, int* quo);
  constexpr long double remquol(long double x, long double y, int* quo);

  constexpr /* floating-point-type */ copysign(/* floating-point-type */ x,
                                               /* floating-point-type */ y);
  constexpr float copysignf(float x, float y);
  constexpr long double copysignl(long double x, long double y);

  double nan(const char* tagp);
  float nanf(const char* tagp);
  long double nanl(const char* tagp);

  constexpr /* floating-point-type */ nextafter(/* floating-point-type */ x,
                                                /* floating-point-type */ y);
  constexpr float nextafterf(float x, float y);
  constexpr long double nextafterl(long double x, long double y);

  constexpr /* floating-point-type */ nexttoward(/* floating-point-type */ x,
                                                 long double y);
  constexpr float nexttowardf(float x, long double y);
  constexpr long double nexttowardl(long double x, long double y);

  constexpr /* floating-point-type */ fdim(/* floating-point-type */ x,
                                           /* floating-point-type */ y);
  constexpr float fdimf(float x, float y);
  constexpr long double fdiml(long double x, long double y);

  constexpr /* floating-point-type */ fmax(/* floating-point-type */ x,
                                           /* floating-point-type */ y);
  constexpr float fmaxf(float x, float y);
  constexpr long double fmaxl(long double x, long double y);

  constexpr /* floating-point-type */ fmin(/* floating-point-type */ x,
                                           /* floating-point-type */ y);
  constexpr float fminf(float x, float y);
  constexpr long double fminl(long double x, long double y);

  constexpr /* floating-point-type */ fma(/* floating-point-type */ x,
                                          /* floating-point-type */ y,
                                          /* floating-point-type */ z);
  constexpr float fmaf(float x, float y, float z);
  constexpr long double fmal(long double x, long double y, long double z);

  // linear interpolation
  constexpr /* floating-point-type */ lerp(/* floating-point-type */ a,
                                           /* floating-point-type */ b,
                                           /* floating-point-type */ t) noexcept;

  // classification / comparison functions
  constexpr int fpclassify(/* floating-point-type */ x);

  constexpr bool isfinite(/* floating-point-type */ x);

  constexpr bool isinf(/* floating-point-type */ x);

  constexpr bool isnan(/* floating-point-type */ x);

  constexpr bool isnormal(/* floating-point-type */ x);

  constexpr bool signbit(/* floating-point-type */ x);

  constexpr bool isgreater(/* floating-point-type */ x,
                           /* floating-point-type */ y);

  constexpr bool isgreaterequal(/* floating-point-type */ x,
                                /* floating-point-type */ y);

  constexpr bool isless(/* floating-point-type */ x,
                        /* floating-point-type */ y);

  constexpr bool islessequal(/* floating-point-type */ x,
                             /* floating-point-type */ y);

  constexpr bool islessgreater(/* floating-point-type */ x,
                               /* floating-point-type */ y);

  constexpr bool isunordered(/* floating-point-type */ x,
                             /* floating-point-type */ y);

  // mathematical special functions

  // associated Laguerre polynomials
  /* floating-point-type */ assoc_laguerre(unsigned n, unsigned m,
                                           /* floating-point-type */ x);
  float assoc_laguerref(unsigned n, unsigned m, float x);
  long double assoc_laguerrel(unsigned n, unsigned m, long double x);

  // associated Legendre functions
  /* floating-point-type */ assoc_legendre(unsigned l, unsigned m,
                                           /* floating-point-type */ x);
  float assoc_legendref(unsigned l, unsigned m, float x);
  long double assoc_legendrel(unsigned l, unsigned m, long double x);

  // beta function
  /* floating-point-type */ beta(/* floating-point-type */ x,
                                 /* floating-point-type */ y);
  float betaf(float x, float y);
  long double betal(long double x, long double y);

  // complete elliptic integral of the first kind
  /* floating-point-type */ comp_ellint_1(/* floating-point-type */ k);
  float comp_ellint_1f(float k);
  long double comp_ellint_1l(long double k);

  // complete elliptic integral of the second kind
  /* floating-point-type */ comp_ellint_2(/* floating-point-type */ k);
  float comp_ellint_2f(float k);
  long double comp_ellint_2l(long double k);

  // complete elliptic integral of the third kind
  /* floating-point-type */ comp_ellint_3(/* floating-point-type */ k,
                                          /* floating-point-type */ nu);
  float comp_ellint_3f(float k, float nu);
  long double comp_ellint_3l(long double k, long double nu);

  // regular modified cylindrical Bessel functions
  /* floating-point-type */ cyl_bessel_i(/* floating-point-type */ nu,
                                         /* floating-point-type */ x);
  float cyl_bessel_if(float nu, float x);
  long double cyl_bessel_il(long double nu, long double x);

  // cylindrical Bessel functions of the first kind
  /* floating-point-type */ cyl_bessel_j(/* floating-point-type */ nu,
                                         /* floating-point-type */ x);
  float cyl_bessel_jf(float nu, float x);
  long double cyl_bessel_jl(long double nu, long double x);

  // irregular modified cylindrical Bessel functions
  /* floating-point-type */ cyl_bessel_k(/* floating-point-type */ nu,
                                         /* floating-point-type */ x);
  float cyl_bessel_kf(float nu, float x);
  long double cyl_bessel_kl(long double nu, long double x);

  // cylindrical Neumann functions;
  // cylindrical Bessel functions of the second kind
  /* floating-point-type */ cyl_neumann(/* floating-point-type */ nu,
                                        /* floating-point-type */ x);
  float cyl_neumannf(float nu, float x);
  long double cyl_neumannl(long double nu, long double x);

  // incomplete elliptic integral of the first kind
  /* floating-point-type */ ellint_1(/* floating-point-type */ k,
                                     /* floating-point-type */ phi);
  float ellint_1f(float k, float phi);
  long double ellint_1l(long double k, long double phi);

  // incomplete elliptic integral of the second kind
  /* floating-point-type */ ellint_2(/* floating-point-type */ k,
                                     /* floating-point-type */ phi);
  float ellint_2f(float k, float phi);
  long double ellint_2l(long double k, long double phi);

  // incomplete elliptic integral of the third kind
  /* floating-point-type */ ellint_3(/* floating-point-type */ k,
                                     /* floating-point-type */ nu,
                                     /* floating-point-type */ phi);
  float ellint_3f(float k, float nu, float phi);
  long double ellint_3l(long double k, long double nu, long double phi);

  // exponential integral
  /* floating-point-type */ expint(/* floating-point-type */ x);
  float expintf(float x);
  long double expintl(long double x);

  // Hermite polynomials
  /* floating-point-type */ hermite(unsigned n, /* floating-point-type */ x);
  float hermitef(unsigned n, float x);
  long double hermitel(unsigned n, long double x);

  // Laguerre polynomials
  /* floating-point-type */ laguerre(unsigned n, /* floating-point-type */ x);
  float laguerref(unsigned n, float x);
  long double laguerrel(unsigned n, long double x);

  // Legendre polynomials
  /* floating-point-type */ legendre(unsigned l, /* floating-point-type */ x);
  float legendref(unsigned l, float x);
  long double legendrel(unsigned l, long double x);

  // Riemann zeta function
  /* floating-point-type */ riemann_zeta(/* floating-point-type */ x);
  float riemann_zetaf(float x);
  long double riemann_zetal(long double x);

  // spherical Bessel functions of the first kind
  /* floating-point-type */ sph_bessel(unsigned n, /* floating-point-type */ x);
  float sph_besself(unsigned n, float x);
  long double sph_bessell(unsigned n, long double x);

  // spherical associated Legendre functions
  /* floating-point-type */ sph_legendre(unsigned l, unsigned m,
                                         /* floating-point-type */ theta);
  float sph_legendref(unsigned l, unsigned m, float theta);
  long double  sph_legendrel(unsigned l, unsigned m, long double theta);

  // spherical Neumann functions;
  // spherical Bessel functions of the second kind
  /* floating-point-type */ sph_neumann(unsigned n, /* floating-point-type */ x);
  float sph_neumannf(unsigned n, float x);
  long double sph_neumannl(unsigned n, long double x);
}
```
