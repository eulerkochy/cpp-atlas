# std::array<T,N>::front

Source: https://en.cppreference.com/w/cpp/container/array/front

```cpp
reference front(); // (1) (since C++11) (constexpr since C++17)
const_reference front() const; // (2) (since C++11) (constexpr since C++14)
```

Returns a reference to the first element in the container.

Calling `front` on an empty container causes undefined behavior.

## Parameters

(none)

## Return value

Reference to the first element.

## Complexity

Constant.

## Notes

For a container `c`, the expression `c.front()` is equivalent to `*c.begin()`.

## Example

The following code uses `front` to display the first element of a `std::array<char, 4>`:

```cpp
#include <cassert>
#include <array>

int main()
{
    std::array<char, 4> letters{'a', 'b', 'c', 'd'};
    assert(letters.front() == 'a');
}
```

## See also

- [`back`](https://en.cppreference.com/w/cpp/container/array/back): access the last element (public member function)
- [`rend`](https://en.cppreference.com/w/cpp/container/array/rend), [`crend`](https://en.cppreference.com/w/cpp/container/array/rend): returns a reverse iterator to the end (public member function)
- [`begin`](https://en.cppreference.com/w/cpp/container/array/begin), [`cbegin`](https://en.cppreference.com/w/cpp/container/array/begin): returns an iterator to the beginning (public member function)
- [`data`](https://en.cppreference.com/w/cpp/container/array/data): direct access to the underlying contiguous storage (public member function)
