# std::unordered_map<Key,T,Hash,KeyEqual,Allocator>::size

Source: https://en.cppreference.com/w/cpp/container/unordered_map/size

```cpp
size_type size() const noexcept; // (since C++11)
```

Returns the number of elements in the container, i.e. `std::distance(begin(), end())`.

## Parameters

(none)

## Return value

The number of elements in the container.

## Complexity

Constant.

## Example

```cpp
#include <cassert>
#include <unordered_map>

int main()
{
    std::unordered_map<int, char> nums{{1, 'a'}, {1, 'b'}, {2, 'c'}, {2, 'd'}};
    assert(nums.size() == 2);
}
```

## See also

- [`empty`](https://en.cppreference.com/w/cpp/container/unordered_map/empty): checks whether the container is empty (public member function)
- [`max_size`](https://en.cppreference.com/w/cpp/container/unordered_map/max_size): returns the maximum possible number of elements (public member function)
- [`size`](https://en.cppreference.com/w/cpp/iterator/size) (C++17), [`ssize`](https://en.cppreference.com/w/cpp/iterator/size) (C++20): returns the size of a container or array (function template)
