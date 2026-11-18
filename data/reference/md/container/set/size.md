# std::set<Key,Compare,Allocator>::size

Source: https://en.cppreference.com/w/cpp/container/set/size

```cpp
size_type size() const; // (noexcept since C++11)
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
#include <set>

int main()
{
    std::set<int> nums{4, 2, 4, 2};
    assert(nums.size() == 2);
}
```

## See also

- [`empty`](https://en.cppreference.com/w/cpp/container/set/empty): checks whether the container is empty (public member function)
- [`max_size`](https://en.cppreference.com/w/cpp/container/set/max_size): returns the maximum possible number of elements (public member function)
- [`size`](https://en.cppreference.com/w/cpp/iterator/size) (C++17), [`ssize`](https://en.cppreference.com/w/cpp/iterator/size) (C++20): returns the size of a container or array (function template)
