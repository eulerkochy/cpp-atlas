# std::vector<T,Allocator>::back

Source: https://en.cppreference.com/w/cpp/container/vector/back

```cpp
reference back(); // (1) (constexpr since C++20)
const_reference back() const; // (2) (constexpr since C++20)
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
#include <vector>

int main()
{
    std::vector<char> letters{'a', 'b', 'c', 'd'};
    assert(letters.back() == 'd');
}
```

## See also

- [`front`](https://en.cppreference.com/w/cpp/container/vector/front): access the first element (public member function)
- [`rbegin`](https://en.cppreference.com/w/cpp/container/vector/rbegin), [`crbegin`](https://en.cppreference.com/w/cpp/container/vector/rbegin) (C++11): returns a reverse iterator to the beginning (public member function)
- [`end`](https://en.cppreference.com/w/cpp/container/vector/end), [`cend`](https://en.cppreference.com/w/cpp/container/vector/end) (C++11): returns an iterator to the end (public member function)
