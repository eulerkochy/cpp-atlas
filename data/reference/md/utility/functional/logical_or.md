# std::logical_or

Source: https://en.cppreference.com/w/cpp/utility/functional/logical_or

```cpp
// Defined in header <functional>

template< class T >
struct logical_or; // (until C++14)

template< class T = void >
struct logical_or; // (since C++14)
```

Function object for performing logical OR (logical disjunction). Effectively calls `operator||` on type `T`.

### Specializations

(since C++14):

The standard library provides a specialization of `std::logical_or` when `T` is not specified, which leaves the parameter types and return type to be deduced.

- `logical_or<void>` (C++14): function object implementing `x || y` deducing parameter and return types (class template specialization)

### Member types

**Type — Definition**

- `result_type` (deprecated in C++17) (removed in C++20): `bool`
- `first_argument_type` (deprecated in C++17) (removed in C++20): `T`
- `second_argument_type` (deprecated in C++17) (removed in C++20): `T`

These member types are obtained via publicly inheriting `std::binary_function<T, T, bool>`. (until C++11)

### Member functions

- `operator()`: returns the logical OR of the two arguments (public member function)

## std::logical_or::operator()

```cpp
bool operator()( const T& lhs, const T& rhs ) const; // (constexpr since C++14)
```

Returns the logical OR of `lhs` and `rhs`.

### Parameters

- `lhs, rhs` - values to compute logical OR of

### Return value

The result of `lhs || rhs`.

### Exceptions

May throw implementation-defined exceptions.

### Possible implementation

```cpp
constexpr bool operator()(const T& lhs, const T& rhs) const
{
    return lhs || rhs;
}
```
