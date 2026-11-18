# std::multiset<Key,Compare,Allocator>::empty

Source: https://en.cppreference.com/w/cpp/container/multiset/empty

```cpp
bool empty() const; // (noexcept since C++11)
```

Checks if the container has no elements, i.e. whether `begin() == end()`.

## Parameters

(none)

## Return value

`true` if the container is empty, `false` otherwise.

## Complexity

Constant.

## Example

The following code uses `empty` to check if a `std::multiset<int>` contains any elements:

```cpp
#include <iostream>
#include <set>

int main()
{
    std::multiset<int> numbers;
    std::cout << std::boolalpha;
    std::cout << "Initially, numbers.empty(): " << numbers.empty() << '\n';

    numbers.insert(42);
    numbers.insert(19937);
    std::cout << "After adding elements, numbers.empty(): " << numbers.empty() << '\n';
}
```

Output:

```text
Initially, numbers.empty(): true
After adding elements, numbers.empty(): false
```

## See also

- [`size`](https://en.cppreference.com/w/cpp/container/multiset/size): returns the number of elements (public member function)
- [`empty`](https://en.cppreference.com/w/cpp/iterator/empty) (C++17): checks whether the container is empty (function template)
