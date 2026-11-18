# std::experimental::reflect::RecordMember

Source: https://en.cppreference.com/w/cpp/experimental/reflect/RecordMember

```cpp
// Defined in header <experimental/reflect>

template< class T >
concept RecordMember = ScopeMember<T> && /* see below */; // (reflection TS)
```

The `RecordMember` concept is satisfied if and only if T reflects a *member-declaration*.

## Example

> Note: This section is incomplete Reason: examples

## See also

> Note: This section is incomplete Reason: templatization
