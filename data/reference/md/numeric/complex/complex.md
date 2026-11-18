# std::complex<T>::complex

Source: https://en.cppreference.com/w/cpp/numeric/complex/complex

```cpp
// Primary template (std::complex<T>)

complex( const T& re = T(), const T& im = T() ); // (1) (until C++14)

constexpr complex( const T& re = T(), const T& im = T() ); // (1) (since C++14)

complex( const complex& other ); // (2) (until C++14)

constexpr complex( const complex& other ); // (2) (since C++14) (until C++23)

constexpr complex( const complex& other ) = default; // (2) (since C++23)

template< class X >
complex( const complex<X>& other ); // (3) (until C++14)

template< class X >
constexpr complex( const complex<X>& other ); // (3) (since C++14) (until C++23)

template< class X >
constexpr explicit(/* see below */) complex( const complex<X>& other ); // (3) (since C++23)

// Standard explicit specialization std::complex<float> (until C++23)

complex( float re = 0.0f, float im = 0.0f ); // (1) (until C++11)

constexpr complex( float re = 0.0f, float im = 0.0f ); // (1) (since C++11)

constexpr complex( const complex<float>& other ) = default; // (2) (since C++20)

explicit complex( const complex<double>& other );
explicit complex( const complex<long double>& other ); // (3) (until C++11)

constexpr explicit complex( const complex<double>& other );
constexpr explicit complex( const complex<long double>& other ); // (3) (since C++11)

// Standard explicit specialization std::complex<double> (until C++23)

complex( double re = 0.0, double im = 0.0 ); // (1) (until C++11)

constexpr complex( double re = 0.0, double im = 0.0 ); // (1) (since C++11)

constexpr complex( const complex<double>& other ) = default; // (2) (since C++20)

complex( const complex<float>& other );
explicit complex( const complex<long double>& other ); // (3) (until C++11)

constexpr complex( const complex<float>& other );
constexpr explicit complex( const complex<long double>& other ); // (3) (since C++11)

// Standard explicit specialization std::complex<long double> (until C++23)

complex( long double re = 0.0L, long double im = 0.0L ); // (1) (until C++11)

constexpr complex( long double re = 0.0L, long double im = 0.0L ); // (1) (since C++11)

constexpr complex( const complex<long double>& other ) = default; // (2) (since C++20)

complex( const complex<float>& other );
complex( const complex<double>& other ); // (3) (until C++11)

constexpr complex( const complex<float>& other );
constexpr complex( const complex<double>& other ); // (3) (since C++11)
```

Constructs the `std::complex` object. The standard explicit specializations (`std::complex<float>`, `std::complex<double>` and `std::complex<long double>`) have different constructor declarations from the main template. (until C++23)

1) Constructs the complex number from real part `re` and imaginary part `im`.

2) Copy constructor. Constructs the object with the copy of the contents of `other`. The copy constructors are implicitly declared in the standard explicit specializations. (until C++20)

3) Converting constructor. Constructs the object from a complex number of a different type.

   (until C++23):

   The main template provides a converting constructor template, while each standard explicit specialization provides two non-template constructors for the two other standard explicit specializations.

   The non-template constructors are converting constructors (i.e. non-explicit) if and only if the conversions of the real and imaginary parts are not narrowing.

   For the main template, the expression inside `explicit` evaluates to `false` if and only if the floating-point conversion rank of `T` is greater than or equal to the floating-point conversion rank of `X`. (since C++23)

## Parameters

- `re` - the real part
- `im` - the imaginary part
- `other` - another complex number to use as source

## Notes

Since C++23, the copy constructor is required to be trivial in order to satisfy the *TriviallyCopyable* requirement, but implementations generally make it trivial in all modes.

## See also

- [`operator=`](https://en.cppreference.com/w/cpp/numeric/complex/operator=): assigns the contents (public member function)
- [`operator""if`](https://en.cppreference.com/w/cpp/numeric/complex/operator%22%22i) (C++14), [`operator""i`](https://en.cppreference.com/w/cpp/numeric/complex/operator%22%22i), [`operator""il`](https://en.cppreference.com/w/cpp/numeric/complex/operator%22%22i): a `std::complex` literal representing purely imaginary number (function)
- [C documentation for `CMPLX`](https://en.cppreference.com/w/c/numeric/complex/CMPLX)
