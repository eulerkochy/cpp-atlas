# std::experimental::reflect::Namespace

Source: https://en.cppreference.com/w/cpp/experimental/reflect/Namespace

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept Namespace = Scope<T> && /* see below */; // (reflection TS)
```

The `Namespace` concept is satisfied if and only if T reflects a namespace including the global namespace (Note: Any such T that does not reflect the global namespace also satisfies `ScopeMember`).

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
