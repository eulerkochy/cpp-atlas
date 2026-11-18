# operator==,!=(std::complex)

Source: https://en.cppreference.com/w/cpp/numeric/complex/operator_cmp

```cpp
// Defined in header <complex>

template< class T >
bool operator==( const complex<T>& lhs, const complex<T>& rhs ); // (1) (until C++14)

template< class T >
constexpr bool operator==( const complex<T>& lhs, const complex<T>& rhs ); // (1) (since C++14)

template< class T >
bool operator==( const complex<T>& lhs, const T& rhs ); // (2) (until C++14)

template< class T >
constexpr bool operator==( const complex<T>& lhs, const T& rhs ); // (2) (since C++14)

template< class T >
bool operator==( const T& lhs, const complex<T>& rhs ); // (3) (until C++14)

template< class T >
constexpr bool operator==( const T& lhs, const complex<T>& rhs ); // (3) (since C++14) (until C++20)

template< class T >
bool operator!=( const complex<T>& lhs, const complex<T>& rhs ); // (4) (until C++14)

template< class T >
constexpr bool operator!=( const complex<T>& lhs, const complex<T>& rhs ); // (4) (since C++14) (until C++20)

template< class T >
bool operator!=( const complex<T>& lhs, const T& rhs ); // (5) (until C++14)

template< class T >
constexpr bool operator!=( const complex<T>& lhs, const T& rhs ); // (5) (since C++14) (until C++20)

template< class T >
bool operator!=( const T& lhs, const complex<T>& rhs ); // (6) (until C++14)

template< class T >
constexpr bool operator!=( const T& lhs, const complex<T>& rhs ); // (6) (since C++14) (until C++20)
```

Compares two complex numbers. Scalar arguments are treated as complex numbers with the real part equal to the argument and the imaginary part set to zero.

1-3) Compares `lhs` and `rhs` for equality.

4-6) Compares `lhs` and `rhs` for inequality.

The `!=` operator is synthesized from `operator==`. (since C++20)

## Parameters

- `lhs, rhs` - the arguments to compare: either both complex numbers or one complex and one scalar of matching type (`float`, `double`, `long double`)

## Return value

1-3) `true` if respective parts of `lhs` are equal to `rhs`, `false` otherwise.

4-6) `!(lhs == rhs)`

## Example

```cpp
#include <complex>

int main()
{
    using std::operator""i; // or: using namespace std::complex_literals;

    static_assert(1.0i == 1.0i);
    static_assert(2.0i != 1.0i);

    constexpr std::complex z(1.0, 0.0);
    static_assert(z == 1.0);
    static_assert(1.0 == z);
    static_assert(2.0 != z);
    static_assert(z != 2.0);
}
```
