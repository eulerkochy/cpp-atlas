# std::flat_set<Key,Compare,KeyContainer>::rend, std::flat_set<Key,Compare,KeyContainer>::crend

Source: https://en.cppreference.com/w/cpp/container/flat_set/rend

```cpp
reverse_iterator rend() noexcept; // (1) (since C++23)
const_reverse_iterator rend() const noexcept; // (2) (since C++23)
const_reverse_iterator crend() const noexcept; // (3) (since C++23)
```

Returns a reverse iterator to the element following the last element of the reversed `flat_set`. It corresponds to the element preceding the first element of the non-reversed `flat_set`. This element acts as a placeholder, attempting to access it results in undefined behavior.

## Parameters

(none)

## Return value

Reverse iterator to the element following the last element.

## Complexity

Constant.

## Notes

Because both `iterator` and `const_iterator` are constant iterators (and may in fact be the same type), it is not possible to mutate the elements of the container through an iterator returned by any of these member functions.

## Example

```cpp
#include <iostream>
#include <flat_set>

int main()
{
    std::flat_set<unsigned> rep{1, 2, 3, 4, 1, 2, 3, 4};

    for (auto it = rep.crbegin(); it != rep.crend(); ++it)
    {
        for (auto n = *it; n > 0; --n)
            std::cout << "⏼" << ' ';
        std::cout << '\n';
    }
}
```

Output:

```text
⏼ ⏼ ⏼ ⏼
⏼ ⏼ ⏼
⏼ ⏼
⏼
```

## See also

- [`rbegin`](https://en.cppreference.com/w/cpp/container/flat_set/rbegin), [`crbegin`](https://en.cppreference.com/w/cpp/container/flat_set/rbegin): returns a reverse iterator to the beginning (public member function)
- [`rend`](https://en.cppreference.com/w/cpp/iterator/rend) (C++14), [`crend`](https://en.cppreference.com/w/cpp/iterator/rend): returns a reverse end iterator for a container or array (function template)
