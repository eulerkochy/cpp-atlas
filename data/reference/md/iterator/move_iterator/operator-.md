# operator-(std::move_iterator)

Source: https://en.cppreference.com/w/cpp/iterator/move_iterator/operator-

```cpp
// Defined in header <iterator>

template< class Iter1, class Iter2 >
auto operator-( const move_iterator<Iter1>& lhs,
                const move_iterator<Iter2>& rhs )
    -> decltype(lhs.base() - rhs.base()); // (since C++11) (constexpr since C++17)
```

Returns the distance between two iterator adaptors.

## Parameters

- `lhs, rhs` - iterator adaptors to compute the difference of

## Return value

`lhs.base() - rhs.base()`

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`operator++`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_arith) (C++11), [`operator++(int)`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_arith), [`operator+=`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_arith), [`operator+`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_arith), [`operator--`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_arith), [`operator--(int)`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_arith), [`operator-=`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_arith), [`operator-`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_arith): advances or decrements the iterator (public member function)
- [`operator+`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator+) (C++11): advances the iterator (function template)
