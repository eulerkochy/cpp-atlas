# std::array<T,N>::back

Source: https://en.cppreference.com/w/cpp/container/array/back

```cpp
reference back(); // (1) (since C++11) (constexpr since C++17)
const_reference back() const; // (2) (since C++11) (constexpr since C++14)
```

Returns a reference to the last element in the container.

Calling `back` on an empty container causes undefined behavior.

## Parameters

(none)

## Return value

Reference to the last element.

## Complexity

Constant.

## Notes

For a non-empty container `c`, the expression `c.back()` is equivalent to `*std::prev(c.end())`.

## Example

```cpp
#include <cassert>
#include <array>

int main()
{
    std::array<char, 4> letters{'a', 'b', 'c', 'd'};
    assert(letters.back() == 'd');
}
```

## See also

- [`front`](https://en.cppreference.com/w/cpp/container/array/front): access the first element (public member function)
- [`rbegin`](https://en.cppreference.com/w/cpp/container/array/rbegin), [`crbegin`](https://en.cppreference.com/w/cpp/container/array/rbegin): returns a reverse iterator to the beginning (public member function)
- [`end`](https://en.cppreference.com/w/cpp/container/array/end), [`cend`](https://en.cppreference.com/w/cpp/container/array/end): returns an iterator to the end (public member function)
