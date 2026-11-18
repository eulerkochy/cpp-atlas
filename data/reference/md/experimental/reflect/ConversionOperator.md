# std::experimental::reflect::ConversionOperator

Source: https://en.cppreference.com/w/cpp/experimental/reflect/ConversionOperator

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept ConversionOperator = Operator<T> && MemberFunction<T> && /* see below */; // (reflection TS)
```

The `ConversionOperator` concept is satisfied if and only if T reflects a conversion function.

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
