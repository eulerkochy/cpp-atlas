# std::deque<T,Allocator>::begin, std::deque<T,Allocator>::cbegin

Source: https://en.cppreference.com/w/cpp/container/deque/begin

```cpp
iterator begin(); // (1) (noexcept since C++11)
const_iterator begin() const; // (2) (noexcept since C++11)
const_iterator cbegin() const noexcept; // (3) (since C++11)
```

Returns an iterator to the first element of the `deque`.

If the `deque` is empty, the returned iterator will be equal to `end()`.

## Parameters

(none)

## Return value

Iterator to the first element.

## Complexity

Constant.

## Notes

libc++ backports `cbegin()` to C++98 mode.

## Example

```cpp
#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <deque>

int main()
{
    std::deque<int> nums{1, 2, 4, 8, 16};
    std::deque<std::string> fruits{"orange", "apple", "raspberry"};
    std::deque<char> empty;

    // Print deque.
    std::for_each(nums.begin(), nums.end(), [](const int n) { std::cout << n << ' '; });
    std::cout << '\n';

    // Sums all integers in the deque nums (if any), printing only the result.
    std::cout << "Sum of nums: "
              << std::accumulate(nums.begin(), nums.end(), 0) << '\n';

    // Prints the first fruit in the deque fruits, checking if there is any.
    if (!fruits.empty())
        std::cout << "First fruit: " << *fruits.begin() << '\n';

    if (empty.begin() == empty.end())
        std::cout << "deque 'empty' is indeed empty.\n";
}
```

Output:

```text
1 2 4 8 16
Sum of nums: 31
First fruit: orange
deque 'empty' is indeed empty.
```

## See also

- [`end`](https://en.cppreference.com/w/cpp/container/deque/end), [`cend`](https://en.cppreference.com/w/cpp/container/deque/end) (C++11): returns an iterator to the end (public member function)
- [`begin`](https://en.cppreference.com/w/cpp/iterator/begin) (C++11), [`cbegin`](https://en.cppreference.com/w/cpp/iterator/begin) (C++14): returns an iterator to the beginning of a container or array (function template)
