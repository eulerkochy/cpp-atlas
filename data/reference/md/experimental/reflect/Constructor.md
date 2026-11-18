# std::experimental::reflect::Constructor

Source: https://en.cppreference.com/w/cpp/experimental/reflect/Constructor

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept Constructor = Callable<T> && RecordMember<T> && /* see below */; // (reflection TS)
```

The `Constructor` concept is satisfied if and only if T reflects a constructor (Note: Some types that satisfy `Constructor` also satisfy `SpecialMemberFunction`).

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
