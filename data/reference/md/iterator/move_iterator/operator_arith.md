# std::move_iterator<Iter>::operator++,+,+=,--,-,-=

Source: https://en.cppreference.com/w/cpp/iterator/move_iterator/operator_arith

```cpp
move_iterator& operator++(); // (1) (constexpr since C++17)
move_iterator& operator--(); // (2) (constexpr since C++17)
move_iterator operator++( int ); // (3) (constexpr since C++17) (until C++20)
constexpr auto operator++( int ); // (3) (since C++20)
move_iterator operator--( int ); // (4) (constexpr since C++17)
move_iterator operator+( difference_type n ) const; // (5) (constexpr since C++17)
move_iterator operator-( difference_type n ) const; // (6) (constexpr since C++17)
move_iterator& operator+=( difference_type n ); // (7) (constexpr since C++17)
move_iterator& operator-=( difference_type n ); // (8) (constexpr since C++17)
```

Increments or decrements the underlying iterator.

**Overload**: (1)

**Equivalent to**: `++current; return *this;`

**Overload**: (2)

**Equivalent to**: `--current; return *this;`

**Overload**: (3)

**Equivalent to**:

`move_iterator tmp = *this; ++current; return tmp;` (until C++20)

(since C++20):

- `move_iterator tmp = *this; ++current; return tmp;`
  if `Iter` models `forward_iterator`
- `++current;` otherwise

**Overload**: (4)

**Equivalent to**: `move_iterator tmp = *this; --current; return tmp;`

**Overload**: (5)

**Equivalent to**: `return move_iterator(current + n);`

**Overload**: (6)

**Equivalent to**: `return move_iterator(current - n);`

**Overload**: (7)

**Equivalent to**: `current += n; return *this;`

**Overload**: (8)

**Equivalent to**: `current -= n; return *this;`

## Parameters

- `n` - position relative to current location

## Return value

As described above.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`operator+`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator+) (C++11): advances the iterator (function template)
- [`operator-`](https://en.cppreference.com/w/cpp/iterator/move_iterator/operator-) (C++11): computes the distance between two iterator adaptors (function template)
