# C++ named requirements: ScalarType

Source: https://en.cppreference.com/w/cpp/named_req/ScalarType

Note: the standard doesn't define a named requirement with this name. This is a type category defined by the core language. It is included here as a named requirement only for consistency.

## Requirements

The following types are collectively called *scalar types*:

- arithmetic types
- enumeration types
- pointer types
- pointer-to-member types

(since C++11):

- `std::nullptr_t`

- cv-qualified versions of these types

## See also

- [`is_scalar`](https://en.cppreference.com/w/cpp/types/is_scalar) (C++11): checks if a type is a scalar type (class template)
