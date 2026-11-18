# std::experimental::reflect::Callable

Source: https://en.cppreference.com/w/cpp/experimental/reflect/Callable

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept Callable = ScopeMember<T> && Scope<T> && /* see below */; // (reflection TS)
```

The `Callable` concept is satisfied if and only if `T` reflects a function, including constructors and destructors.

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
