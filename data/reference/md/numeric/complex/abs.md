# std::abs(std::complex)

Source: https://en.cppreference.com/w/cpp/numeric/complex/abs

```cpp
// Defined in header <complex>

template< class T >
T abs( const complex<T>& z );
```

Returns the magnitude of the complex number `z`.

## Parameters

- `z` - complex value

## Return value

If no errors occur, returns the absolute value (also known as norm, modulus, or magnitude) of `z`.

Errors and special cases are handled as if the function is implemented as `std::hypot(std::real(z), std::imag(z))`.

## Example

```cpp
#include <complex>
#include <iostream>

int main()
{
    std::complex<double> z(1, 1);
    std::cout << z << " cartesian is rho = " << std::abs(z)
              << " theta = " << std::arg(z) << " polar\n";
}
```

Output:

```text
(1,1) cartesian is rho = 1.41421 theta = 0.785398 polar
```

## See also

- [`arg`](https://en.cppreference.com/w/cpp/numeric/complex/arg): returns the phase angle (function template)
- [`polar`](https://en.cppreference.com/w/cpp/numeric/complex/polar): constructs a complex number from magnitude and phase angle (function template)
- [`abs(int)`](https://en.cppreference.com/w/cpp/numeric/math/abs), [`labs`](https://en.cppreference.com/w/cpp/numeric/math/abs), [`llabs`](https://en.cppreference.com/w/cpp/numeric/math/abs) (C++11): computes absolute value of an integral value (|x|) (function)
- [`abs(float)`](https://en.cppreference.com/w/cpp/numeric/math/fabs), [`fabs`](https://en.cppreference.com/w/cpp/numeric/math/fabs), [`fabsf`](https://en.cppreference.com/w/cpp/numeric/math/fabs) (C++11), [`fabsl`](https://en.cppreference.com/w/cpp/numeric/math/fabs) (C++11): absolute value of a floating point value (|x|) (function)
- [`hypot`](https://en.cppreference.com/w/cpp/numeric/math/hypot) (C++11), [`hypotf`](https://en.cppreference.com/w/cpp/numeric/math/hypot) (C++11), [`hypotl`](https://en.cppreference.com/w/cpp/numeric/math/hypot) (C++11): computes hypotenuse √x²+y² and √x²+y²+z² (since C++17) (function)
- [`abs(std::valarray)`](https://en.cppreference.com/w/cpp/numeric/valarray/abs): applies the function `abs` to each element of valarray (function template)
- [C documentation for `cabs`](https://en.cppreference.com/w/c/numeric/complex/cabs)
