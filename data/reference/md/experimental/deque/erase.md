# std::experimental::erase (std::deque)

Source: https://en.cppreference.com/w/cpp/experimental/deque/erase

```cpp
// Defined in header <experimental/deque>

template< class T, class A, class U >
void erase( std::deque<T, A>& c, const U& value ); // (library fundamentals TS v2)
```

Erases all elements that compare equal to `value` from the container. Equivalent to `c.erase(std::remove(c.begin(), c.end(), value), c.end());`.

## Parameters

- `c` - container from which to erase
- `value` - value to be removed

## Complexity

Linear.

## Example

```cpp
#include <experimental/deque>
#include <iostream>

auto show = [](const auto& container)
{
    for (auto e : container)
        std::cout << e;
    std::cout << '\n';
};

int main()
{
    std::deque<int> data{1, 1, 1, 4, 1, 1, 1, 2, 1, 1, 1};
    show(data);
    std::experimental::erase(data, 1);
    show(data);
}
```

Output:

```text
11141112111
42
```

## See also

- [`remove`](https://en.cppreference.com/w/cpp/algorithm/remove), [`remove_if`](https://en.cppreference.com/w/cpp/algorithm/remove): removes elements satisfying specific criteria (function template)
- [`erase_if (std::deque)`](https://en.cppreference.com/w/cpp/experimental/deque/erase_if) (library fundamentals 2 TS): erases all elements satisfying a predicate from a `std::deque` (function template)
