# std::experimental::reflect::Type

Source: https://en.cppreference.com/w/cpp/experimental/reflect/Type

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept Type = Named<T> && ScopeMember<T> && /* see below */; // (reflection TS)
```

The `Type` concept is satisfied if and only if `T` reflects a type.

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
