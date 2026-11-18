# std::basic_string<CharT,Traits,Allocator>::rend, std::basic_string<CharT,Traits,Allocator>::crend

Source: https://en.cppreference.com/w/cpp/string/basic_string/rend

```cpp
reverse_iterator rend(); // (1) (noexcept since C++11) (constexpr since C++20)
const_reverse_iterator rend() const; // (2) (noexcept since C++11) (constexpr since C++20)
const_reverse_iterator crend() const noexcept; // (3) (since C++11) (constexpr since C++20)
```

Returns a reverse iterator to the character following the last character of the reversed string. It corresponds to the character preceding the first character of the non-reversed string. This character acts as a placeholder, attempting to access it results in undefined behavior.

## Parameters

(none)

## Return value

Reverse iterator to the character following the last character.

## Complexity

Constant.

## Notes

libc++ backports `crend()` to C++98 mode.

## Example

```cpp
#include <algorithm>
#include <iostream>
#include <iterator>
#include <string>

int main()
{
    std::string p("[A man, a plan, a canal: Panama]");
    std::string q;

    std::copy(p.crbegin(), p.crend(), std::back_inserter(q));
    std::cout << "q = " << q << '\n';

    std::copy(q.crbegin(), q.crend(), p.rbegin());
    std::cout << "p = " << p << '\n';
}
```

Output:

```text
q = ]amanaP :lanac a ,nalp a ,nam A[
p = ]amanaP :lanac a ,nalp a ,nam A[
```

## See also

- [`rbegin`](https://en.cppreference.com/w/cpp/string/basic_string/rbegin), [`crbegin`](https://en.cppreference.com/w/cpp/string/basic_string/rbegin) (C++11): returns a reverse iterator to the beginning (public member function)
- [`rend`](https://en.cppreference.com/w/cpp/string/basic_string_view/rend), [`crend`](https://en.cppreference.com/w/cpp/string/basic_string_view/rend): returns a reverse iterator to the end (public member function of `std::basic_string_view<CharT,Traits>`)
