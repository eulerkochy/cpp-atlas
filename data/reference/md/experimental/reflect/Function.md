# std::experimental::reflect::Function

Source: https://en.cppreference.com/w/cpp/experimental/reflect/Function

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept Function = Callable<T> && Typed<T> && /* see below */; // (reflection TS)
```

The `Function` concept is satisfied if and only if T reflects a function, excluding constructors and destructors.

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
