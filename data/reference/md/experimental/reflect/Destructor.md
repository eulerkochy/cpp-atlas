# std::experimental::reflect::Destructor

Source: https://en.cppreference.com/w/cpp/experimental/reflect/Destructor

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept Destructor = Callable<T> && SpecialMemberFunction<T> && /* see below */; // (reflection TS)
```

The `Destructor` concept is satisfied if and only if T reflects a destructor.

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
