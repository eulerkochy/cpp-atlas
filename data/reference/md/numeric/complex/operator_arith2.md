# std::complex<T>::operator+(unary), operator-(unary)

Source: https://en.cppreference.com/w/cpp/numeric/complex/operator_arith2

```cpp
template< class T >
std::complex<T> operator+( const std::complex<T>& val ); // (1) (until C++20)

template< class T >
constexpr std::complex<T> operator+( const std::complex<T>& val ); // (1) (since C++20)

template< class T >
std::complex<T> operator-( const std::complex<T>& val ); // (2) (until C++20)

template< class T >
constexpr std::complex<T> operator-( const std::complex<T>& val ); // (2) (since C++20)
```

Implements the analogs of the unary arithmetic operators for complex numbers.

1) Returns the value of its argument

2) Negates the argument

## Parameters

- `val` - the complex number argument

## Return value

1) a copy of the argument, `std::complex<T>(val)`

2) negated argument, `std::complex<T>(-val.real(), -val.imag())`

## See also

- [`operator+`](https://en.cppreference.com/w/cpp/numeric/complex/operator_arith3), [`operator-`](https://en.cppreference.com/w/cpp/numeric/complex/operator_arith3), [`operator*`](https://en.cppreference.com/w/cpp/numeric/complex/operator_arith3), [`operator/`](https://en.cppreference.com/w/cpp/numeric/complex/operator_arith3): performs complex number arithmetic on two complex values or a complex and a scalar (function template)
