# std::not_equal_to

Source: https://en.cppreference.com/w/cpp/utility/functional/not_equal_to

```cpp
// Defined in header <functional>

template< class T >
struct not_equal_to; // (until C++14)

template< class T = void >
struct not_equal_to; // (since C++14)
```

Function object for performing comparisons. Unless specialised, invokes `operator!=` on type `T`.

### Specializations

(since C++14):

The standard library provides a specialization of `std::not_equal_to` when `T` is not specified, which leaves the parameter types and return type to be deduced.

- `not_equal_to<void>` (C++14): function object implementing `x != y` deducing parameter and return types (class template specialization)

### Member types

**Type — Definition**

- `result_type` (deprecated in C++17) (removed in C++20): `bool`
- `first_argument_type` (deprecated in C++17) (removed in C++20): `T`
- `second_argument_type` (deprecated in C++17) (removed in C++20): `T`

These member types are obtained via publicly inheriting `std::binary_function<T, T, bool>`. (until C++11)

### Member functions

- `operator()`: checks if the arguments are *not equal* (public member function)

## std::not_equal_to::operator()

```cpp
bool operator()( const T& lhs, const T& rhs ) const; // (constexpr since C++14)
```

Checks whether `lhs` is *not equal* to `rhs`.

### Parameters

- `lhs, rhs` - values to compare

### Return value

`true` if `lhs != rhs`, `false` otherwise.

### Exceptions

May throw implementation-defined exceptions.

### Possible implementation

```cpp
constexpr bool operator()(const T& lhs, const T& rhs) const
{
    return lhs != rhs;
}
```

### See also

- [`equal`](https://en.cppreference.com/w/cpp/algorithm/equal): determines if two sets of elements are the same (function template)
- [`less`](https://en.cppreference.com/w/cpp/utility/functional/less): function object implementing `x < y` (class template)
- [`ranges::not_equal_to`](https://en.cppreference.com/w/cpp/utility/functional/ranges/not_equal_to) (C++20): constrained function object implementing `x != y` (class)
