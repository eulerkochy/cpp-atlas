# std::exp(std::complex)

Source: https://en.cppreference.com/w/cpp/numeric/complex/exp

```cpp
// Defined in header <complex>

template< class T >
std::complex<T> exp( const std::complex<T>& z );
```

Compute base-e exponential of `z`, that is *e* (Euler's number, `2.7182818`) raised to the `z` power.

## Parameters

- `z` - complex value

## Return value

If no errors occur, *e* raised to the power of `z`, e^(z), is returned.

## Error handling and special values

Errors are reported consistent with `math_errhandling`.

If the implementation supports IEEE floating-point arithmetic,

- `std::exp(std::conj(z)) == std::conj(std::exp(z))`
- If `z` is `(±0,+0)`, the result is `(1,+0)`
- If `z` is `(x,+∞)` (for any finite x), the result is `(NaN,NaN)` and `FE_INVALID` is raised.
- If `z` is `(x,NaN)` (for any finite x), the result is `(NaN,NaN)` and `FE_INVALID` may be raised.
- If `z` is `(+∞,+0)`, the result is `(+∞,+0)`
- If `z` is `(-∞,y)` (for any finite y), the result is `+0cis(y)`
- If `z` is `(+∞,y)` (for any finite nonzero y), the result is `+∞cis(y)`
- If `z` is `(-∞,+∞)`, the result is `(±0,±0)` (signs are unspecified)
- If `z` is `(+∞,+∞)`, the result is `(±∞,NaN)` and `FE_INVALID` is raised (the sign of the real part is unspecified)
- If `z` is `(-∞,NaN)`, the result is `(±0,±0)` (signs are unspecified)
- If `z` is `(+∞,NaN)`, the result is `(±∞,NaN)` (the sign of the real part is unspecified)
- If `z` is `(NaN,+0)`, the result is `(NaN,+0)`
- If `z` is `(NaN,y)` (for any nonzero y), the result is `(NaN,NaN)` and `FE_INVALID` may be raised
- If `z` is `(NaN,NaN)`, the result is `(NaN,NaN)`

where cis(y) is cos(y) + i sin(y).

## Notes

The complex exponential function e^(z) for z = x+iy equals e^(x) cis(y), or, e^(x) (cos(y) + i sin(y)).

The exponential function is an *entire function* in the complex plane and has no branch cuts.

The following have equivalent results when the real part is 0:

- `std::exp(std::complex<float>(0, theta))`
- `std::complex<float>(cosf(theta), sinf(theta))`
- `std::polar(1.f, theta)`

In this case `exp` can be about 4.5x slower. One of the other forms should be used instead of calling `exp` with an argument whose real part is literal 0. There is no benefit in trying to avoid `exp` with a runtime check of `z.real() == 0` though.

## Example

```cpp
#include <cmath>
#include <complex>
#include <iostream>

int main()
{
   const double pi = std::acos(-1.0);
   const std::complex<double> i(0.0, 1.0);

   std::cout << std::fixed << " exp(i * pi) = " << std::exp(i * pi) << '\n';
}
```

Output:

```text
exp(i * pi) = (-1.000000,0.000000)
```

## See also

- [`log(std::complex)`](https://en.cppreference.com/w/cpp/numeric/complex/log): complex natural logarithm with the branch cuts along the negative real axis (function template)
- [`exp`](https://en.cppreference.com/w/cpp/numeric/math/exp), [`expf`](https://en.cppreference.com/w/cpp/numeric/math/exp) (C++11), [`expl`](https://en.cppreference.com/w/cpp/numeric/math/exp) (C++11): returns e raised to the given power (ex) (function)
- [`exp(std::valarray)`](https://en.cppreference.com/w/cpp/numeric/valarray/exp): applies the function `std::exp` to each element of valarray (function template)
- [`polar`](https://en.cppreference.com/w/cpp/numeric/complex/polar): constructs a complex number from magnitude and phase angle (function template)
- [C documentation for `cexp`](https://en.cppreference.com/w/c/numeric/complex/cexp)
