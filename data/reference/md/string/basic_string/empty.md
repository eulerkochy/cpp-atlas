# std::basic_string<CharT,Traits,Allocator>::empty

Source: https://en.cppreference.com/w/cpp/string/basic_string/empty

```cpp
bool empty() const; // (noexcept since C++11) (constexpr since C++20)
```

Checks if the string has no characters, i.e. whether `begin() == end()`.

## Parameters

(none)

## Return value

`true` if the string is empty, `false` otherwise

## Complexity

Constant.

## Example

```cpp
#include <iostream>
#include <string>

int main()
{
    std::string s;
    std::boolalpha(std::cout);
    std::cout << "s.empty():" << s.empty() << "\t s:'" << s << "'\n";

    s = "Exemplar";
    std::cout << "s.empty():" << s.empty() << "\t s:'" << s << "'\n";

    s = "";
    std::cout << "s.empty():" << s.empty() << "\t s:'" << s << "'\n";
}
```

Output:

```text
s.empty():true   s:''
s.empty():false  s:'Exemplar'
s.empty():true   s:''
```

## See also

- [`size`](https://en.cppreference.com/w/cpp/string/basic_string/size), [`length`](https://en.cppreference.com/w/cpp/string/basic_string/size): returns the number of characters (public member function)
- [`max_size`](https://en.cppreference.com/w/cpp/string/basic_string/max_size): returns the maximum number of characters (public member function)
- [`capacity`](https://en.cppreference.com/w/cpp/string/basic_string/capacity): returns the number of characters that can be held in currently allocated storage (public member function)
- [`size`](https://en.cppreference.com/w/cpp/iterator/size) (C++17), [`ssize`](https://en.cppreference.com/w/cpp/iterator/size) (C++20): returns the size of a container or array (function template)
- [`empty`](https://en.cppreference.com/w/cpp/iterator/empty) (C++17): checks whether the container is empty (function template)
- [`empty`](https://en.cppreference.com/w/cpp/string/basic_string_view/empty): checks whether the view is empty (public member function of `std::basic_string_view<CharT,Traits>`)
