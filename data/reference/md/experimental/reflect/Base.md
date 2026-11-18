# std::experimental::reflect::Base

Source: https://en.cppreference.com/w/cpp/experimental/reflect/Base

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept Base = Object<T> && /* see below */; // (reflection TS)
```

The `Base` concept is satisfied if and only if `T` reflects a direct base class, as returned by the template `get_base_classes`.

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
