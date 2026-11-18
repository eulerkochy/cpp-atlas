# std::basic_string_view<CharT,Traits>::operator=

Source: https://en.cppreference.com/w/cpp/string/basic_string_view/operator=

```cpp
constexpr basic_string_view& operator=( const basic_string_view& view ) noexcept = default; // (since C++17)
```

Replaces the view with that of `view`.

## Parameters

- `view` - view to copy

## Return value

`*this`

## Complexity

Constant.

## Example

```cpp
#include <iostream>
#include <string_view>

int main()
{
    std::string_view v = "Hello, world";
    v = v.substr(7);
    std::cout << v << '\n';
}
```

Output:

```text
world
```

## See also

- [(constructor)](https://en.cppreference.com/w/cpp/string/basic_string_view/basic_string_view): constructs a `basic_string_view` (public member function)
- [`operator=`](https://en.cppreference.com/w/cpp/string/basic_string/operator=): assigns values to the string (public member function of `std::basic_string<CharT,Traits,Allocator>`)
