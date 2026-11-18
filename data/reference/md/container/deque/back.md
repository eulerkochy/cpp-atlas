# std::deque<T,Allocator>::back

Source: https://en.cppreference.com/w/cpp/container/deque/back

```cpp
reference back(); // (1)
const_reference back() const; // (2)
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
#include <deque>

int main()
{
    std::deque<char> letters{'a', 'b', 'c', 'd'};
    assert(letters.back() == 'd');
}
```

## See also

- [`front`](https://en.cppreference.com/w/cpp/container/deque/front): access the first element (public member function)
- [`rbegin`](https://en.cppreference.com/w/cpp/container/deque/rbegin), [`crbegin`](https://en.cppreference.com/w/cpp/container/deque/rbegin) (C++11): returns a reverse iterator to the beginning (public member function)
- [`end`](https://en.cppreference.com/w/cpp/container/deque/end), [`cend`](https://en.cppreference.com/w/cpp/container/deque/end) (C++11): returns an iterator to the end (public member function)
