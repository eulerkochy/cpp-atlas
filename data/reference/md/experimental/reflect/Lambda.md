# std::experimental::reflect::Lambda

Source: https://en.cppreference.com/w/cpp/experimental/reflect/Lambda

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept Lambda = Type<T> && Scope<T> && /* see below */; // (reflection TS)
```

The `Lambda` concept is satisfied if and only if T reflects a closure object (excluding generic lambdas).

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
