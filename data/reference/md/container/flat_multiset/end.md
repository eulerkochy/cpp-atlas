# std::flat_multiset<Key,Compare,KeyContainer>::end, std::flat_multiset<Key,Compare,KeyContainer>::cend

Source: https://en.cppreference.com/w/cpp/container/flat_multiset/end

```cpp
iterator end() noexcept; // (1) (since C++23)
const_iterator end() const noexcept; // (2) (since C++23)
const_iterator cend() const noexcept; // (3) (since C++23)
```

Returns an iterator to the element following the last element of the `flat_multiset`.

This element acts as a placeholder; attempting to access it results in undefined behavior.

## Parameters

(none)

## Return value

Iterator to the element following the last element.

## Complexity

Constant.

## Notes

Because both `iterator` and `const_iterator` are constant iterators (and may in fact be the same type), it is not possible to mutate the elements of the container through an iterator returned by any of these member functions.

## Example

```cpp
#include <algorithm>
#include <flat_set>
#include <iostream>

int main()
{
    std::flat_multiset<int> set{3, 1, 4, 1, 5, 9, 2, 6, 5};
    std::for_each(set.cbegin(), set.cend(), [](int x)
    {
        std::cout << x << ' ';
    });
    std::cout << '\n';
}
```

Output:

```text
1 1 2 3 4 5 5 6 9
```

## See also

- [`begin`](https://en.cppreference.com/w/cpp/container/flat_multiset/begin), [`cbegin`](https://en.cppreference.com/w/cpp/container/flat_multiset/begin): returns an iterator to the beginning (public member function)
- [`end`](https://en.cppreference.com/w/cpp/iterator/end) (C++11), [`cend`](https://en.cppreference.com/w/cpp/iterator/end) (C++14): returns an iterator to the end of a container or array (function template)
