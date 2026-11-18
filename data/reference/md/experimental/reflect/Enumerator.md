# std::experimental::reflect::Enumerator

Source: https://en.cppreference.com/w/cpp/experimental/reflect/Enumerator

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept Enumerator = Typed<T> && ScopeMember<T> && /* see below */; // (reflection TS)
```

The `Enumerator` concept is satisfied if and only if T reflects an enumerator (Note: The `Scope` of an `Enumerator` is its type also for enumerations that are unscoped enumeration types).

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
