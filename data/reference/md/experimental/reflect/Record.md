# std::experimental::reflect::Record

Source: https://en.cppreference.com/w/cpp/experimental/reflect/Record

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept Record = Type<T> && Scope<T> && /* see below */; // (reflection TS)
```

The `Record` concept is satisfied if and only if T reflects a class type.

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
