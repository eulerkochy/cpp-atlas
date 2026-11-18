# operator==,!=(std::allocator)

Source: https://en.cppreference.com/w/cpp/memory/allocator/operator_cmp

```cpp
template< class T1, class T2 >
bool operator==( const allocator<T1>& lhs, const allocator<T2>& rhs ) throw(); // (1) (until C++11)

template< class T1, class T2 >
bool operator==( const allocator<T1>& lhs, const allocator<T2>& rhs ) noexcept; // (1) (since C++11) (until C++20)

template< class T1, class T2 >
constexpr bool
    operator==( const allocator<T1>& lhs, const allocator<T2>& rhs ) noexcept; // (1) (since C++20)

template< class T1, class T2 >
bool operator!=( const allocator<T1>& lhs, const allocator<T2>& rhs ) throw(); // (2) (until C++11)

template< class T1, class T2 >
bool operator!=( const allocator<T1>& lhs, const allocator<T2>& rhs ) noexcept; // (2) (since C++11) (until C++20)
```

Compares two default allocators. Since default allocators are stateless, two default allocators are always equal.

1) Returns `true`.

2) Returns `false`.

The `!=` operator is synthesized from `operator==`. (since C++20)

## Parameters

- `lhs, rhs` - default allocators to compare

## Return value

1) `true`

2) `false`
