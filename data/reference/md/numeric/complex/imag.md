# std::complex<T>::imag

Source: https://en.cppreference.com/w/cpp/numeric/complex/imag

```cpp
// primary template std::complex<T>
T imag() const; // (1) (until C++14)
constexpr T imag() const; // (1) (since C++14)
void imag( T value ); // (2) (until C++20)
constexpr void imag( T value ); // (2) (since C++20)
// specialization std::complex<float>
float imag() const; // (1) (until C++11)
constexpr float imag() const; // (1) (since C++11)
void imag( float value ); // (2) (until C++20)
constexpr void imag( float value ); // (2) (since C++20)
// specialization std::complex<double>
double imag() const; // (1) (until C++11)
constexpr double imag() const; // (1) (since C++11)
void imag( double value ); // (2) (until C++20)
constexpr void imag( double value ); // (2) (since C++20)
// specialization std::complex<long double>
long double imag() const; // (1) (until C++11)
constexpr long double imag() const; // (1) (since C++11)
void imag( long double value ); // (2) (until C++20)
constexpr void imag( long double value ); // (2) (since C++20)
```

Accesses the imaginary part of the complex number.

1) Returns the imaginary part.

2) Sets the imaginary part to `value`.

## Parameters

- `value` - the value to set the imaginary part to

## Return value

1) The imaginary part of `*this`.

2) (none)

## Notes

In C++11, overload (1) in `std::complex` specializations used to be specified without `const` qualifier. However, in C++11, a `constexpr` specifier used in a non-static member function implies `const`, and thus the behavior is as if `const` is specified.

## Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| LWG 387 | C++98 | the imaginary part could not be set directly | can be set directly via a new `imag` overload |

## See also

- [`imag`](https://en.cppreference.com/w/cpp/numeric/complex/imag2): returns the imaginary part (function template)
- [`real`](https://en.cppreference.com/w/cpp/numeric/complex/real): accesses the real part of the complex number (public member function)
