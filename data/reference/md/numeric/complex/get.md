# std::get(std::complex)

Source: https://en.cppreference.com/w/cpp/numeric/complex/get

```cpp
// Defined in header <complex>

template< std::size_t I >
friend constexpr T& get( std::complex<T>& x ); // (1) (since C++26)

template< std::size_t I >
friend constexpr const T& get( const std::complex<T>& x ); // (2) (since C++26)

template< std::size_t I >
friend constexpr T&& get( std::complex<T>&& x ); // (3) (since C++26)

template< std::size_t I >
friend constexpr const T&& get( const std::complex<T>&& x ); // (4) (since C++26)
```

Returns the reference to real or imaginary part from a `complex` when `I == 0` or `I == 1`, respectively. It is mainly provided for structured binding support.

## Parameters

- `x` - a `complex`

## Return value

1-4) A reference to the real or imaginary part from the stored one when `I == 0` or `I == 1`, respectively.

## Notes

| Feature-test macro | Value | Std | Feature |
| --- | --- | --- | --- |
| `__cpp_lib_tuple_like` | `202311L` | (C++26) | Add tuple protocol to `std::complex` |

## Example

```cpp
#include <complex>

static_assert([z = std::complex(1.0, 2.0)]
{
#if __cpp_lib_tuple_like >= 202311L
    return std::get<0>(z) == 1.0 and std::get<1>(z) == 2.0;
#else
    return z.real() == 1.0 and z.imag() == 2.0;
#endif
}());

int main() {}
```

## See also

- [Structured binding (C++17)](https://en.cppreference.com/w/cpp/language/structured_binding): binds the specified names to sub-objects or tuple elements of the initializer
- [`get(std::tuple)`](https://en.cppreference.com/w/cpp/utility/tuple/get) (C++11): tuple accesses specified element (function template)
- [`get(std::pair)`](https://en.cppreference.com/w/cpp/utility/pair/get) (C++11): accesses an element of a `pair` (function template)
- [`get(std::array)`](https://en.cppreference.com/w/cpp/container/array/get) (C++11): accesses an element of an `array` (function template)
