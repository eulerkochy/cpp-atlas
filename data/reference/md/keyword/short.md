# C++ keyword: short

Source: https://en.cppreference.com/w/cpp/keyword/short

## Usage

- `short` type modifier

## Example

```cpp
#include <climits>
#include <concepts>
#include <iostream>
#include <limits>

static_assert(sizeof(short) >= 16 / CHAR_BIT);
static_assert(sizeof(unsigned short) >= 16 / CHAR_BIT);
static_assert(std::numeric_limits<short>::min() <= -32'768); //'
static_assert(std::numeric_limits<short>::max() >= 32'767); //'
static_assert(std::numeric_limits<unsigned short>::max() >= 65'535u); //'

// concepts are available since C++20
static_assert(std::integral<short> and std::integral<unsigned short>);

template <typename T, typename... Ts>
concept all_same = (... and std::same_as <T, Ts>);

static_assert(all_same<short, short int, signed short, signed short int>);
static_assert(all_same<unsigned short, unsigned short int>);

#define OUT(...) std::cout << #__VA_ARGS__ << " = " << __VA_ARGS__ << '\n'

int main()
{
    OUT(sizeof(short));
    OUT(sizeof(unsigned short));
    OUT(std::numeric_limits<short>::min());
    OUT(std::numeric_limits<short>::max());
    OUT(std::numeric_limits<unsigned short>::max());
}

#undef OUT
```

Possible output:

```text
sizeof(short) = 2
sizeof(unsigned short) = 2
std::numeric_limits<short>::min() = -32768
std::numeric_limits<short>::max() = 32767
std::numeric_limits<unsigned short>::max() = 65535
```

## See also

- [Fundamental types](https://en.cppreference.com/w/cpp/language/types): [`void`](https://en.cppreference.com/w/cpp/keyword/void), [`std::nullptr_t`](https://en.cppreference.com/w/cpp/types/nullptr_t) (since C++11).
  - [Integral types](https://en.cppreference.com/w/cpp/language/types#Integral_types): [`int`](https://en.cppreference.com/w/cpp/keyword/int). [Modifiers](https://en.cppreference.com/w/cpp/language/types#Modifiers): [`signed`](https://en.cppreference.com/w/cpp/keyword/signed), [`unsigned`](https://en.cppreference.com/w/cpp/keyword/unsigned), `short`, [`long`](https://en.cppreference.com/w/cpp/keyword/long).
    - [Boolean type](https://en.cppreference.com/w/cpp/language/types#Boolean_type): [`bool`](https://en.cppreference.com/w/cpp/keyword/bool). [Boolean literals](https://en.cppreference.com/w/cpp/language/bool_literal): [`false`](https://en.cppreference.com/w/cpp/keyword/false), [`true`](https://en.cppreference.com/w/cpp/keyword/true).
    - [Character types](https://en.cppreference.com/w/cpp/language/types#Character_types): [`char`](https://en.cppreference.com/w/cpp/keyword/char), [`char8_t`](https://en.cppreference.com/w/cpp/keyword/char8_t) (since C++20), [`char16_t`](https://en.cppreference.com/w/cpp/keyword/char16_t), [`char32_t`](https://en.cppreference.com/w/cpp/keyword/char32_t) (since C++11), [`wchar_t`](https://en.cppreference.com/w/cpp/keyword/wchar_t).
  - [Floating-point types](https://en.cppreference.com/w/cpp/language/types#Floating-point_types): [`float`](https://en.cppreference.com/w/cpp/keyword/float), [`double`](https://en.cppreference.com/w/cpp/keyword/double).
