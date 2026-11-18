# std::experimental::reflect::MemberFunction

Source: https://en.cppreference.com/w/cpp/experimental/reflect/MemberFunction

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept MemberFunction = RecordMember<T> && Function<T> && /* see below */; // (reflection TS)
```

The `MemberFunction` concept is satisfied if and only if T reflects a member function, excluding constructors and destructors.

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
