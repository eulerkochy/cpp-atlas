# std::experimental::reflect::SpecialMemberFunction

Source: https://en.cppreference.com/w/cpp/experimental/reflect/SpecialMemberFunction

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept SpecialMemberFunction = RecordMember<T> && /* see below */; // (reflection TS)
```

The `SpecialMemberFunction` concept is satisfied if and only if `T` reflects a special member function.

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
