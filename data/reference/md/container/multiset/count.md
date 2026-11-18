# std::multiset<Key,Compare,Allocator>::count

Source: https://en.cppreference.com/w/cpp/container/multiset/count

```cpp
size_type count( const Key& key ) const; // (1)

template< class K >
size_type count( const K& x ) const; // (2) (since C++14)
```

Returns the number of elements with key that compares *equivalent* to the specified argument.

1) Returns the number of elements with key `key`.

2) Returns the number of elements with key that compares equivalent to the value `x`. This overload participates in overload resolution only if the qualified-id `Compare::is_transparent` is valid and denotes a type. It allows calling this function without constructing an instance of `Key`.

## Parameters

- `key` - key value of the elements to count
- `x` - alternative value to compare to the keys

## Return value

Number of elements with key that compares *equivalent* to `key` or `x`.

## Complexity

Logarithmic in the size of the container plus linear in the number of elements found.

## Notes

| Feature-test macro | Value | Std | Feature |
| --- | --- | --- | --- |
| `__cpp_lib_generic_associative_lookup` | `201304L` | (C++14) | Heterogeneous comparison lookup in associative containers; overload (2) |

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`find`](https://en.cppreference.com/w/cpp/container/multiset/find): finds element with specific key (public member function)
- [`equal_range`](https://en.cppreference.com/w/cpp/container/multiset/equal_range): returns range of elements matching a specific key (public member function)
