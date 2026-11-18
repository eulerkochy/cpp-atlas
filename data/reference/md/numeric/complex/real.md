# std::complex<T>::real

Source: https://en.cppreference.com/w/cpp/numeric/complex/real

```cpp
// primary template std::complex<T>
T real() const; // (1) (until C++14)
constexpr T real() const; // (1) (since C++14)
void real( T value ); // (2) (until C++20)
constexpr void real( T value ); // (2) (since C++20)
// specialization std::complex<float>
float real() const; // (1) (until C++11)
constexpr float real() const; // (1) (since C++11)
void real( float value ); // (2) (until C++20)
constexpr void real( float value ); // (2) (since C++20)
// specialization std::complex<double>
double real() const; // (1) (until C++11)
constexpr double real() const; // (1) (since C++11)
void real( double value ); // (2) (until C++20)
constexpr void real( double value ); // (2) (since C++20)
// specialization std::complex<long double>
long double real() const; // (1) (until C++11)
constexpr long double real() const; // (1) (since C++11)
void real( long double value ); // (2) (until C++20)
constexpr void real( long double value ); // (2) (since C++20)
```

Accesses the real part of the complex number.

1) Returns the real part.

2) Sets the real part to `value`.

## Parameters

- `value` - the value to set the real part to

## Return value

1) The real part of `*this`.

2) (none)

## Notes

In C++11, overload (1) in `std::complex` specializations used to be specified without `const` qualifier. However, in C++11, a `constexpr` specifier used in a non-static member function implies `const`, and thus the behavior is as if `const` is specified.

## Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| LWG 387 | C++98 | the real part could not be set directly | can be set directly via a new `real` overload |

## See also

- [`real`](https://en.cppreference.com/w/cpp/numeric/complex/real2): returns the real part (function template)
- [`imag`](https://en.cppreference.com/w/cpp/numeric/complex/imag): accesses the imaginary part of the complex number (public member function)
