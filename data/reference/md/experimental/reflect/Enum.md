# std::experimental::reflect::Enum

Source: https://en.cppreference.com/w/cpp/experimental/reflect/Enum

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept Enum = Type<T> && Scope<T> && /* see below */; // (reflection TS)
```

The `Enum` concept is satisfied if and only if T reflects an enumeration type.

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
