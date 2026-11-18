# std::flat_multimap<Key,T,Compare,KeyContainer,MappedContainer>::emplace_hint

Source: https://en.cppreference.com/w/cpp/container/flat_multimap/emplace_hint

```cpp
template< class... Args >
iterator emplace_hint( const_iterator hint, Args&&... args ); // (since C++23)
```

Inserts a new element into the container as close as possible to the position just before `hint`.

The constructor of the element type (`value_type`, that is, `std::pair<const Key, T>`) is called with exactly the same arguments as supplied to the function, forwarded with `std::forward<Args>(args)...`.

> Note: Information on iterator invalidation is copied from here

## Parameters

- `hint` - iterator to the position before which the new element will be inserted
- `args` - arguments to forward to the constructor of the element

## Return value

An iterator to the inserted element.

## Exceptions

If an exception is thrown for any reason, this function has no effect (strong exception safety guarantee).

## Complexity

> Note: This section is incomplete

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`emplace`](https://en.cppreference.com/w/cpp/container/flat_multimap/emplace): constructs element in-place (public member function)
- [`insert`](https://en.cppreference.com/w/cpp/container/flat_multimap/insert): inserts elements (public member function)
