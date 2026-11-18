# std::flat_multiset<Key,Compare,KeyContainer>::begin, std::flat_multiset<Key,Compare,KeyContainer>::cbegin

Source: https://en.cppreference.com/w/cpp/container/flat_multiset/begin

```cpp
iterator begin() noexcept; // (1) (since C++23)
const_iterator begin() const noexcept; // (2) (since C++23)
const_iterator cbegin() const noexcept; // (3) (since C++23)
```

Returns an iterator to the first element of the `flat_multiset`.

If the `flat_multiset` is empty, the returned iterator will be equal to `end()`.

## Parameters

(none)

## Return value

Iterator to the first element.

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

- [`end`](https://en.cppreference.com/w/cpp/container/flat_multiset/end), [`cend`](https://en.cppreference.com/w/cpp/container/flat_multiset/end): returns an iterator to the end (public member function)
- [`begin`](https://en.cppreference.com/w/cpp/iterator/begin) (C++11), [`cbegin`](https://en.cppreference.com/w/cpp/iterator/begin) (C++14): returns an iterator to the beginning of a container or array (function template)
