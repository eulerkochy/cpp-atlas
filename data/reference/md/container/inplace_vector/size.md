# std::inplace_vector<T,N>::size

Source: https://en.cppreference.com/w/cpp/container/inplace_vector/size

```cpp
constexpr size_type size() const; // (since C++26)
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
#include <inplace_vector>

int main()
{
    std::inplace_vector<int, 4> nums;
    assert(nums.size() == 0);
    nums = {1, 2, 3, 4};
    assert(nums.size() == 4);
}
```

## See also

- [`capacity`](https://en.cppreference.com/w/cpp/container/inplace_vector/capacity) [static]: returns the number of elements that can be held in currently allocated storage (public static member function)
- [`empty`](https://en.cppreference.com/w/cpp/container/inplace_vector/empty): checks whether the container is empty (public member function)
- [`max_size`](https://en.cppreference.com/w/cpp/container/inplace_vector/max_size) [static]: returns the maximum possible number of elements (public static member function)
- [`resize`](https://en.cppreference.com/w/cpp/container/inplace_vector/resize): changes the number of elements stored (public member function)
- [`size`](https://en.cppreference.com/w/cpp/iterator/size) (C++17), [`ssize`](https://en.cppreference.com/w/cpp/iterator/size) (C++20): returns the size of a container or array (function template)
