# std::vector<T,Allocator>::end, std::vector<T,Allocator>::cend

Source: https://en.cppreference.com/w/cpp/container/vector/end

```cpp
iterator end(); // (1) (until C++11)
iterator end() noexcept; // (1) (since C++11) (constexpr since C++20)
const_iterator end() const; // (2) (until C++11)
const_iterator end() const noexcept; // (2) (since C++11) (constexpr since C++20)
const_iterator cend() const noexcept; // (3) (since C++11) (constexpr since C++20)
```

Returns an iterator to the element following the last element of the `vector`.

This element acts as a placeholder; attempting to access it results in undefined behavior.

## Parameters

(none)

## Return value

Iterator to the element following the last element.

## Complexity

Constant.

## Notes

libc++ backports `cend()` to C++98 mode.

## Example

```cpp
#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>

int main()
{
    std::vector<int> nums{1, 2, 4, 8, 16};
    std::vector<std::string> fruits{"orange", "apple", "raspberry"};
    std::vector<char> empty;

    // Print vector.
    std::for_each(nums.begin(), nums.end(), [](const int n) { std::cout << n << ' '; });
    std::cout << '\n';

    // Sums all integers in the vector nums (if any), printing only the result.
    std::cout << "Sum of nums: "
              << std::accumulate(nums.begin(), nums.end(), 0) << '\n';

    // Prints the first fruit in the vector fruits, checking if there is any.
    if (!fruits.empty())
        std::cout << "First fruit: " << *fruits.begin() << '\n';

    if (empty.begin() == empty.end())
        std::cout << "vector 'empty' is indeed empty.\n";
}
```

Output:

```text
1 2 4 8 16
Sum of nums: 31
First fruit: orange
vector 'empty' is indeed empty.
```

## See also

- [`begin`](https://en.cppreference.com/w/cpp/container/vector/begin), [`cbegin`](https://en.cppreference.com/w/cpp/container/vector/begin) (C++11): returns an iterator to the beginning (public member function)
- [`end`](https://en.cppreference.com/w/cpp/iterator/end) (C++11), [`cend`](https://en.cppreference.com/w/cpp/iterator/end) (C++14): returns an iterator to the end of a container or array (function template)
