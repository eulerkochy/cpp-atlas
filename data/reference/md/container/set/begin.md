# std::set<Key,Compare,Allocator>::begin, std::set<Key,Compare,Allocator>::cbegin

Source: https://en.cppreference.com/w/cpp/container/set/begin

```cpp
iterator begin(); // (1) (noexcept since C++11)
const_iterator begin() const; // (2) (noexcept since C++11)
const_iterator cbegin() const noexcept; // (3) (since C++11)
```

Returns an iterator to the first element of the `set`.

If the `set` is empty, the returned iterator will be equal to `end()`.

## Parameters

(none)

## Return value

Iterator to the first element.

## Complexity

Constant.

## Notes

Because both `iterator` and `const_iterator` are constant iterators (and may in fact be the same type), it is not possible to mutate the elements of the container through an iterator returned by any of these member functions.

libc++ backports `cbegin()` to C++98 mode.

## Example

```cpp
#include <algorithm>
#include <iostream>
#include <set>

int main()
{
    std::set<int> set{3, 1, 4, 1, 5, 9, 2, 6, 5};
    std::for_each(set.cbegin(), set.cend(), [](int x)
    {
        std::cout << x << ' ';
    });
    std::cout << '\n';
}
```

Output:

```text
1 2 3 4 5 6 9
```

## See also

- [`end`](https://en.cppreference.com/w/cpp/container/set/end), [`cend`](https://en.cppreference.com/w/cpp/container/set/end) (C++11): returns an iterator to the end (public member function)
- [`begin`](https://en.cppreference.com/w/cpp/iterator/begin) (C++11), [`cbegin`](https://en.cppreference.com/w/cpp/iterator/begin) (C++14): returns an iterator to the beginning of a container or array (function template)
