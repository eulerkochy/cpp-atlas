# std::sinh(std::complex)

Source: https://en.cppreference.com/w/cpp/numeric/complex/sinh

```cpp
// Defined in header <complex>

template< class T >
complex<T> sinh( const complex<T>& z ); // (since C++11)
```

Computes complex hyperbolic sine of a complex value `z`.

## Parameters

- `z` - complex value

## Return value

If no errors occur, complex hyperbolic sine of `z` is returned.

## Error handling and special values

Errors are reported consistent with `math_errhandling`.

If the implementation supports IEEE floating-point arithmetic,

- `std::sinh(std::conj(z)) == std::conj(std::sinh(z))`
- `std::sinh(z) == -std::sinh(-z)`
- If `z` is `(+0,+0)`, the result is `(+0,+0)`
- If `z` is `(+0,+∞)`, the result is `(±0,NaN)` (the sign of the real part is unspecified) and `FE_INVALID` is raised
- If `z` is `(+0,NaN)`, the result is `(±0,NaN)`
- If `z` is `(x,+∞)` (for any positive finite x), the result is `(NaN,NaN)` and `FE_INVALID` is raised
- If `z` is `(x,NaN)` (for any positive finite x), the result is `(NaN,NaN)` and `FE_INVALID` may be raised
- If `z` is `(+∞,+0)`, the result is `(+∞,+0)`
- If `z` is `(+∞,y)` (for any positive finite y), the result is `+∞cis(y)`
- If `z` is `(+∞,+∞)`, the result is `(±∞,NaN)` (the sign of the real part is unspecified) and `FE_INVALID` is raised
- If `z` is `(+∞,NaN)`, the result is `(±∞,NaN)` (the sign of the real part is unspecified)
- If `z` is `(NaN,+0)`, the result is `(NaN,+0)`
- If `z` is `(NaN,y)` (for any finite nonzero y), the result is `(NaN,NaN)` and `FE_INVALID` may be raised
- If `z` is `(NaN,NaN)`, the result is `(NaN,NaN)`

where cis(y) is cos(y) + i sin(y).

## Notes

Mathematical definition of hyperbolic sine is

sinh z = e^(z)-e^(-z)
2

.

Hyperbolic sine is an entire function in the complex plane and has no branch cuts. It is periodic with respect to the imaginary component, with period 2πi.

## Example

```cpp
#include <cmath>
#include <complex>
#include <iostream>

int main()
{
    std::cout << std::fixed;
    std::complex<double> z(1.0, 0.0); // behaves like real sinh along the real line
    std::cout << "sinh" << z << " = " << std::sinh(z)
              << " (sinh(1) = " << std::sinh(1) << ")\n";

    std::complex<double> z2(0.0, 1.0); // behaves like sine along the imaginary line
    std::cout << "sinh" << z2 << " = " << std::sinh(z2)
              << " ( sin(1) = " << std::sin(1) << ")\n";
}
```

Output:

```text
sinh(1.000000,0.000000) = (1.175201,0.000000) (sinh(1) = 1.175201)
sinh(0.000000,1.000000) = (0.000000,0.841471) ( sin(1) = 0.841471)
```

## See also

- [`cosh(std::complex)`](https://en.cppreference.com/w/cpp/numeric/complex/cosh): computes hyperbolic cosine of a complex number (cosh(z)) (function template)
- [`tanh(std::complex)`](https://en.cppreference.com/w/cpp/numeric/complex/tanh): computes hyperbolic tangent of a complex number (tanh(z)) (function template)
- [`asinh(std::complex)`](https://en.cppreference.com/w/cpp/numeric/complex/asinh) (C++11): computes area hyperbolic sine of a complex number (arsinh(z)) (function template)
- [`sinh`](https://en.cppreference.com/w/cpp/numeric/math/sinh), [`sinhf`](https://en.cppreference.com/w/cpp/numeric/math/sinh) (C++11), [`sinhl`](https://en.cppreference.com/w/cpp/numeric/math/sinh) (C++11): computes hyperbolic sine (sinh(x)) (function)
- [`sinh(std::valarray)`](https://en.cppreference.com/w/cpp/numeric/valarray/sinh): applies the function `std::sinh` to each element of valarray (function template)
- [C documentation for `csinh`](https://en.cppreference.com/w/c/numeric/complex/csinh)
