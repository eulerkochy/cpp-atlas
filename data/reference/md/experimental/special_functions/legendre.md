# std::legendre, std::legendref, std::legendrel

Source: https://en.cppreference.com/w/cpp/experimental/special_functions/legendre

```cpp
double      legendre( unsigned int n, double x );
double      legendre( unsigned int n, float x );
double      legendre( unsigned int n, long double x );
float       legendref( unsigned int n, float x );
long double legendrel( unsigned int n, long double x ); // (1)

double      legendre( unsigned int n, IntegralType x ); // (2)
```

1) Computes the unassociated Legendre polynomials of the degree `n` and argument `x`.

2) A set of overloads or a function template accepting an argument of any integral type. Equivalent to (1) after casting the argument to `double`.

As all special functions, `legendre` is only guaranteed to be available in `<cmath>` if `__STDCPP_MATH_SPEC_FUNCS__` is defined by the implementation to a value at least 201003L and if the user defines `__STDCPP_WANT_MATH_SPEC_FUNCS__` before including any standard library headers.

## Parameters

- `n` - the degree of the polynomial
- `x` - the argument, a value of a floating-point or integral type

## Return value

If no errors occur, value of the order-

`n`

unassociated Legendre polynomial of

`x`

, that is

1
2ⁿn! dⁿ
dxⁿ (x² - 1)ⁿ

, is returned.

## Error handling

Errors may be reported as specified in `math_errhandling`.

- If the argument is NaN, NaN is returned and domain error is not reported.
- The function is not required to be defined for |x| > 1.
- If `n` is greater or equal than 128, the behavior is implementation-defined.

## Notes

Implementations that do not support TR 29124 but support TR 19768, provide this function in the header `tr1/cmath` and namespace `std::tr1`.

An implementation of this function is also available in boost.math.

The first few Legendre polynomials are:

- legendre(0, x) = 1.
- legendre(1, x) = x.
- legendre(2, x) = 1
  2 (3x² - 1).
- legendre(3, x) = 1
  2 (5x³ - 3x).
- legendre(4, x) = 1
  8 (35x⁴ - 30x² + 3).

## Example

(works as shown with gcc 6.0)

```cpp
#define __STDCPP_WANT_MATH_SPEC_FUNCS__ 1
#include <cmath>
#include <iostream>

double P3(double x)
{
    return 0.5 * (5 * std::pow(x, 3) - 3 * x);
}

double P4(double x)
{
    return 0.125 * (35 * std::pow(x, 4) - 30 * x * x + 3);
}

int main()
{
    // spot-checks
    std::cout << std::legendre(3, 0.25) << '=' << P3(0.25) << '\n'
              << std::legendre(4, 0.25) << '=' << P4(0.25) << '\n';
}
```

Output:

```text
-0.335938=-0.335938
0.157715=0.157715
```

## See also

- [`laguerre`](https://en.cppreference.com/w/cpp/experimental/special_functions/laguerre), [`laguerref`](https://en.cppreference.com/w/cpp/experimental/special_functions/laguerre), [`laguerrel`](https://en.cppreference.com/w/cpp/experimental/special_functions/laguerre): Laguerre polynomials (function)
- [`hermite`](https://en.cppreference.com/w/cpp/experimental/special_functions/hermite), [`hermitef`](https://en.cppreference.com/w/cpp/experimental/special_functions/hermite), [`hermitel`](https://en.cppreference.com/w/cpp/experimental/special_functions/hermite): Hermite polynomials (function)

## External links

Weisstein, Eric W. "Legendre Polynomial." From MathWorld — A Wolfram Web Resource.
