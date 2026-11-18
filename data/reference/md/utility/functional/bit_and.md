# std::bit_and

Source: https://en.cppreference.com/w/cpp/utility/functional/bit_and

```cpp
// Defined in header <functional>

template< class T >
struct bit_and; // (until C++14)

template< class T = void >
struct bit_and; // (since C++14)
```

Function object for performing bitwise AND. Effectively calls `operator&` on type `T`.

### Specializations

(since C++14):

The standard library provides a specialization of `std::bit_and` when `T` is not specified, which leaves the parameter types and return type to be deduced.

- `bit_and<void>` (C++14): function object implementing `x & y` deducing parameter and return types (class template specialization)

### Member types

**Type — Definition**

- `result_type` (deprecated in C++17) (removed in C++20): `T`
- `first_argument_type` (deprecated in C++17) (removed in C++20): `T`
- `second_argument_type` (deprecated in C++17) (removed in C++20): `T`

These member types are obtained via publicly inheriting `std::binary_function<T, T, T>`. (until C++11)

### Member functions

- `operator()`: returns the result of bitwise AND of two arguments (public member function)

## std::bit_and::operator()

```cpp
T operator()( const T& lhs, const T& rhs ) const; // (constexpr since C++14)
```

Returns the result of bitwise AND of `lhs` and `rhs`.

### Parameters

- `lhs, rhs` - values to compute bitwise AND of

### Return value

The result of `lhs & rhs`.

### Exceptions

May throw implementation-defined exceptions.

### Possible implementation

```cpp
constexpr T operator()(const T& lhs, const T& rhs) const
{
    return lhs & rhs;
}
```

### Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| LWG 660 | C++98 | function objects for bitwise operations are missing | added |
