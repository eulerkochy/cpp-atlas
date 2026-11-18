# std::deque<T,Allocator>::size

Source: https://en.cppreference.com/w/cpp/container/deque/size

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

The following code uses `size` to display the number of elements in a `std::deque`:

```cpp
#include <deque>
#include <iostream>

int main()
{
    std::deque<int> nums{1, 3, 5, 7};

    std::cout << "nums contains " << nums.size() << " elements.\n";
}
```

Output:

```text
nums contains 4 elements.
```

## See also

- [`empty`](https://en.cppreference.com/w/cpp/container/deque/empty): checks whether the container is empty (public member function)
- [`max_size`](https://en.cppreference.com/w/cpp/container/deque/max_size): returns the maximum possible number of elements (public member function)
- [`resize`](https://en.cppreference.com/w/cpp/container/deque/resize): changes the number of elements stored (public member function)
- [`size`](https://en.cppreference.com/w/cpp/iterator/size) (C++17), [`ssize`](https://en.cppreference.com/w/cpp/iterator/size) (C++20): returns the size of a container or array (function template)
