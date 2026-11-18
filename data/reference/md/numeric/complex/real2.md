# std::real(std::complex)

Source: https://en.cppreference.com/w/cpp/numeric/complex/real2

```cpp
// Defined in header <complex>

template< class T >
T real( const std::complex<T>& z ); // (1) (until C++14)

template< class T >
constexpr T real( const std::complex<T>& z ); // (1) (since C++14)

// Additional overloads (since C++11)

// Defined in header <complex>

float       real( float f );
double      real( double f );
long double real( long double f ); // (A) (until C++14)

constexpr float       real( float f );
constexpr double      real( double f );
constexpr long double real( long double f ); // (A) (since C++14) (until C++23)

template< class FloatingPoint >
constexpr FloatingPoint real( FloatingPoint f ); // (A) (since C++23)

template< class Integer >
double real( Integer i ); // (B) (until C++14)

template< class Integer >
constexpr double real( Integer i ); // (B) (since C++14)
```

1) Returns the real part of the complex number `z`, i.e. `z.real()`.

A,B) Additional overloads are provided for all integer and floating-point types, which are treated as complex numbers with zero imaginary part. (since C++11)

## Parameters

- `z` - complex value
- `f` - floating-point value
- `i` - integer value

## Return value

1) The real part of `z`.

A) `f`.

B) `static_cast<double>(i)`.

## Notes

The additional overloads are not required to be provided exactly as (A,B). They only need to be sufficient to ensure that for their argument `num`:

- If `num` has a standard (until C++23) floating-point type `T`, then `std::real(num)` has the same effect as `std::real(std::complex<T>(num))`.
- Otherwise, if `num` has an integer type, then `std::real(num)` has the same effect as `std::real(std::complex<double>(num))`.

## See also

- [`real`](https://en.cppreference.com/w/cpp/numeric/complex/real): accesses the real part of the complex number (public member function)
- [`imag`](https://en.cppreference.com/w/cpp/numeric/complex/imag2): returns the imaginary part (function template)
- [C documentation for `creal`](https://en.cppreference.com/w/c/numeric/complex/creal)
