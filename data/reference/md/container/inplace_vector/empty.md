# std::inplace_vector<T,N>::empty

Source: https://en.cppreference.com/w/cpp/container/inplace_vector/empty

```cpp
constexpr bool empty() const noexcept; // (since C++26)
```

Checks if the container has no elements, i.e. whether `begin() == end()`.

## Parameters

(none)

## Return value

`true` if the container is empty, `false` otherwise.

## Complexity

Constant.

## Example

```cpp
#include <cassert>
#include <inplace_vector>

int main()
{
    std::inplace_vector<char, 8> v;
    assert(v.empty());

    v.push_back('_');
    assert(not v.empty());
}
```

## See also

- [`size`](https://en.cppreference.com/w/cpp/container/inplace_vector/size): returns the number of elements (public member function)
- [`empty`](https://en.cppreference.com/w/cpp/iterator/empty) (C++17): checks whether the container is empty (function template)
