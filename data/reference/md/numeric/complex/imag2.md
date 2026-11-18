# std::imag(std::complex)

Source: https://en.cppreference.com/w/cpp/numeric/complex/imag2

```cpp
// Defined in header <complex>

template< class T >
T imag( const std::complex<T>& z ); // (1) (until C++14)

template< class T >
constexpr T imag( const std::complex<T>& z ); // (1) (since C++14)

// Additional overloads (since C++11)

// Defined in header <complex>

float       imag( float f );
double      imag( double f );
long double imag( long double f ); // (A) (until C++14)

constexpr float       imag( float f );
constexpr double      imag( double f );
constexpr long double imag( long double f ); // (A) (since C++14) (until C++23)

template< class FloatingPoint >
FloatingPoint imag( FloatingPoint f ); // (A) (since C++23)

template< class Integer >
double imag( Integer i ); // (B) (until C++14)

template< class Integer >
constexpr double imag( Integer i ); // (B) (since C++14)
```

1) Returns the imaginary part of the complex number `z`, i.e. `z.imag()`.

A,B) Additional overloads are provided for all integer and floating-point types, which are treated as complex numbers with zero imaginary part. (since C++11)

## Parameters

- `z` - complex value
- `f` - floating-point value
- `i` - integer value

## Return value

1) The imaginary part of `z`.

A) `decltype(f){}` (zero).

B) `0.0`.

## Notes

The additional overloads are not required to be provided exactly as (A,B). They only need to be sufficient to ensure that for their argument `num`:

- If `num` has a standard (until C++23) floating-point type `T`, then `std::imag(num)` has the same effect as `std::imag(std::complex<T>(num))`.
- Otherwise, if `num` has an integer type, then `std::imag(num)` has the same effect as `std::imag(std::complex<double>(num))`.

## See also

- [`imag`](https://en.cppreference.com/w/cpp/numeric/complex/imag): accesses the imaginary part of the complex number (public member function)
- [`real`](https://en.cppreference.com/w/cpp/numeric/complex/real2): returns the real part (function template)
- [C documentation for `cimag`](https://en.cppreference.com/w/c/numeric/complex/cimag)
