# std::array<T,N>::rend, std::array<T,N>::crend

Source: https://en.cppreference.com/w/cpp/container/array/rend

```cpp
reverse_iterator rend() noexcept; // (1) (since C++11) (constexpr since C++17)
const_reverse_iterator rend() const noexcept; // (2) (since C++11) (constexpr since C++17)
const_reverse_iterator crend() const noexcept; // (3) (since C++11) (constexpr since C++17)
```

Returns a reverse iterator to the element following the last element of the reversed `array`. It corresponds to the element preceding the first element of the non-reversed `array`. This element acts as a placeholder, attempting to access it results in undefined behavior.

## Parameters

(none)

## Return value

Reverse iterator to the element following the last element.

## Complexity

Constant.

## Example

```cpp
#include <algorithm>
#include <iostream>
#include <array>

int main()
{
    std::array<int, 11> a{1, 11, 11, 35, 0, 12, 79, 76, 76, 69, 40};

    // Print elements of container in reverse order using const_reverse_iterator's.
    std::for_each(a.crbegin(), a.crend(), [](int e){ std::cout << e << ' '; });
    std::cout << '\n';

    // Modify each element of container using non-const reverse_iterator's.
    std::for_each(a.rbegin(), a.rend(), [](int& e){ e += 32; });

    // Print elements as chars in reverse order using const_reverse_iterator's.
    std::for_each(a.crbegin(), a.crend(), [](char e){ std::cout << e; });
    std::cout << '\n';
}
```

Output:

```text
40 69 76 76 79 12 0 35 11 11 1
Hello, C++!
```

## See also

- [`rbegin`](https://en.cppreference.com/w/cpp/container/array/rbegin), [`crbegin`](https://en.cppreference.com/w/cpp/container/array/rbegin): returns a reverse iterator to the beginning (public member function)
- [`rend`](https://en.cppreference.com/w/cpp/iterator/rend) (C++14), [`crend`](https://en.cppreference.com/w/cpp/iterator/rend): returns a reverse end iterator for a container or array (function template)
