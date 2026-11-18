# std::basic_string_view<CharT,Traits>::swap

Source: https://en.cppreference.com/w/cpp/string/basic_string_view/swap

```cpp
constexpr void swap( basic_string_view& v ) noexcept; // (since C++17)
```

Exchanges the view with that of `v`.

## Parameters

- `v` - view to swap with

## Return value

(none)

## Complexity

Constant.

## Example

```cpp
#include <iostream>
#include <string_view>

int main()
{
    std::string_view a = "AAA";
    std::string_view b = "BBBB";

    std::cout << "Before swap:\n"
                 "a = " << a << "\n"
                 "b = " << b << "\n\n";

    a.swap(b);

    std::cout << "After swap:\n"
                 "a = " << a << "\n"
                 "b = " << b << '\n';
}
```

Output:

```text
Before swap:
a = AAA
b = BBBB

After swap:
a = BBBB
b = AAA
```

## See also

- [`swap`](https://en.cppreference.com/w/cpp/algorithm/swap): swaps the values of two objects (function template)
- [`swap_ranges`](https://en.cppreference.com/w/cpp/algorithm/swap_ranges): swaps two ranges of elements (function template)
- [`swap`](https://en.cppreference.com/w/cpp/string/basic_string/swap): swaps the contents (public member function of `std::basic_string<CharT,Traits,Allocator>`)
