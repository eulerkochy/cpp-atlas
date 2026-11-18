# std::allocator<T>::allocator

Source: https://en.cppreference.com/w/cpp/memory/allocator/allocator

```cpp
allocator() throw(); // (1) (until C++11)

allocator() noexcept; // (1) (since C++11) (until C++20)

constexpr allocator() noexcept; // (1) (since C++20)

allocator( const allocator& other ) throw(); // (2) (until C++11)

allocator( const allocator& other ) noexcept; // (2) (since C++11) (until C++20)

constexpr allocator( const allocator& other ) noexcept; // (2) (since C++20)

template< class U >
allocator( const allocator<U>& other ) throw(); // (3) (until C++11)

template< class U >
allocator( const allocator<U>& other ) noexcept; // (3) (since C++11) (until C++20)

template< class U >
constexpr allocator( const allocator<U>& other ) noexcept; // (3) (since C++20)
```

Constructs the default allocator. Since the default allocator is stateless, the constructors have no visible effect.

## Parameters

- `other` - another allocator to construct with
