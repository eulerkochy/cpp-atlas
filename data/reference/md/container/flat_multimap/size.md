# std::flat_multimap<Key,T,Compare,KeyContainer,MappedContainer>::size

Source: https://en.cppreference.com/w/cpp/container/flat_multimap/size

```cpp
size_type size() const noexcept; // (since C++23)
```

Returns the number of elements in the container adaptor. Equivalent to: `return c.keys.size()`.

## Parameters

(none)

## Return value

The number of elements in the container adaptor.

## Complexity

Constant.

## Example

```cpp
#include <cassert>
#include <flat_map>

int main()
{
    std::flat_multimap<int, char> nums{{1, 'a'}, {1, 'b'}, {2, 'c'}, {2, 'd'}};
    assert(nums.size() == 4);
}
```

## See also

- [`empty`](https://en.cppreference.com/w/cpp/container/flat_multimap/empty): checks whether the container adaptor is empty (public member function)
- [`size`](https://en.cppreference.com/w/cpp/iterator/size) (C++17), [`ssize`](https://en.cppreference.com/w/cpp/iterator/size) (C++20): returns the size of a container or array (function template)
- [`max_size`](https://en.cppreference.com/w/cpp/container/flat_multimap/max_size): returns the maximum possible number of elements (public member function)
