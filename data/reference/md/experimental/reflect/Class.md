# std::experimental::reflect::Class

Source: https://en.cppreference.com/w/cpp/experimental/reflect/Class

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept Class = Record<T> && /* see below */; // (reflection TS)
```

The `Class` concept is satisfied if and only if T reflects a non-union class type.

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
