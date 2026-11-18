# std::experimental::reflect::Operator

Source: https://en.cppreference.com/w/cpp/experimental/reflect/Operator

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept Operator = Function<T> && /* see below */; // (reflection TS)
```

The `Operator` concept is satisfied if and only if T reflects an operator function or a conversion function (Note: Some types that satisfy `Operator` also satisfy `MemberFunction` or `SpecialMemberFunction`).

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
