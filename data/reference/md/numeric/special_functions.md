# Mathematical special functions (since C++17)

Source: https://en.cppreference.com/w/cpp/numeric/special_functions

The Mathematical Special Functions library was originally part of Library TR1 ISO/IEC TR 19768:2007, then published as an independent ISO standard, ISO/IEC 29124:2010, and finally merged to ISO C++ as of C++17.

See Mathematical special functions for the ISO/IEC 29124:2010 version of this library.

## Functions

Defined in header `<cmath>`

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

## Notes

The `float` and `long double` overloads for math special functions without the "`f`" or "`l`" suffix are present in the final draft of ISO/IEC 29124:2010 (N3060), but absent in the published C++17/20 standard (see LWG issue 3234). These overloads were not provided by MSVC STL until VS 2022 17.3.

These functions are unrelated to special member functions of class types.

| Feature-test macro | Value | Std | Feature |
| --- | --- | --- | --- |
| `__cpp_lib_math_special_functions` | `201603L` | (C++17) | Mathematical special functions |

## Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| LWG 3234 (P1467R9) | C++17 | additional overloads for math special functions were missing | these overloads are required |

## References

- C++23 standard (ISO/IEC 14882:2024):

  - 28.7.6 Mathematical special functions [sf.cmath]

- C++20 standard (ISO/IEC 14882:2020):

  - 26.8.6 Mathematical special functions [sf.cmath]

- C++17 standard (ISO/IEC 14882:2017):

  - 29.9.5 Mathematical special functions [sf.cmath]
