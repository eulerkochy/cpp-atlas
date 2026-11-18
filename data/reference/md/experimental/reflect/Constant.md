# std::experimental::reflect::Constant

Source: https://en.cppreference.com/w/cpp/experimental/reflect/Constant

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept Constant = ScopeMember<T> && Typed<T> && /* see below */; // (reflection TS)
```

The `Constant` concept is satisfied if and only if `T` reflects a constant expression.

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
