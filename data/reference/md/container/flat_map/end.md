# std::flat_map<Key,T,Compare,KeyContainer,MappedContainer>::end, std::flat_map<Key,T,Compare,KeyContainer,MappedContainer>::cend

Source: https://en.cppreference.com/w/cpp/container/flat_map/end

```cpp
iterator end() noexcept; // (1) (since C++23)
const_iterator end() const noexcept; // (2) (since C++23)
const_iterator cend() const noexcept; // (3) (since C++23)
```

Returns an iterator to the element following the last element of the `flat_map`.

This element acts as a placeholder; attempting to access it results in undefined behavior.

## Parameters

(none)

## Return value

Iterator to the element following the last element.

## Complexity

Constant.

## Example

```cpp
#include <iostream>
#include <flat_map>

int main()
{
    std::flat_map<int, double> map{{4, 4.13}, {9, 9.24}, {1, 1.09}};

    for (auto it = map.cbegin(); it != map.cend(); ++it)
        std::cout << '[' << it->first << "] = " << it->second << '\n';

    // Unlike std::map's bidirectional iterators, the std::flat_map iterators
    // are random-access, so they can be used with the operator[]:
    auto it = map.cbegin();
    assert(it[0] == map[1]);
    assert(it[1] == map[4]);
    assert(it[2] == map[9]);
}
```

Output:

```text
[1] = 1.09
[4] = 4.13
[9] = 9.24
```

## See also

- [`begin`](https://en.cppreference.com/w/cpp/container/flat_map/begin), [`cbegin`](https://en.cppreference.com/w/cpp/container/flat_map/begin): returns an iterator to the beginning (public member function)
- [`end`](https://en.cppreference.com/w/cpp/iterator/end) (C++11), [`cend`](https://en.cppreference.com/w/cpp/iterator/end) (C++14): returns an iterator to the end of a container or array (function template)
