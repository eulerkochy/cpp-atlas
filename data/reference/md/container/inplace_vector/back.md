# std::inplace_vector<T,N>::back

Source: https://en.cppreference.com/w/cpp/container/inplace_vector/back

```cpp
constexpr reference back(); // (1) (since C++26)
constexpr const_reference back() const; // (2) (since C++26)
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
#include <inplace_vector>

int main()
{
    std::inplace_vector<char, 4> letters{'a', 'b', 'c', 'd'};
    assert(letters.back() == 'd');
}
```

## See also

- [`front`](https://en.cppreference.com/w/cpp/container/inplace_vector/front): access the first element (public member function)
- [`rbegin`](https://en.cppreference.com/w/cpp/container/inplace_vector/rbegin), [`crbegin`](https://en.cppreference.com/w/cpp/container/inplace_vector/rbegin): returns a reverse iterator to the beginning (public member function)
- [`end`](https://en.cppreference.com/w/cpp/container/inplace_vector/end), [`cend`](https://en.cppreference.com/w/cpp/container/inplace_vector/end): returns an iterator to the end (public member function)
