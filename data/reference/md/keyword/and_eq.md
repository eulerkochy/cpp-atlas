# C++ keyword: and_eq

Source: https://en.cppreference.com/w/cpp/keyword/and_eq

## Usage

- alternative operators: as an alternative for `&=`

## Example

```cpp
#include <bitset>
#include <iostream>

int main()
{
    std::bitset<4> mask("1100");
    std::bitset<4> val("0111");
    val and_eq mask;
    std::cout << val << '\n';
}
```

Output:

```text
0100
```

## See also

- [`and`](https://en.cppreference.com/w/cpp/keyword/and)
- [`bitand`](https://en.cppreference.com/w/cpp/keyword/bitand), [`bitor`](https://en.cppreference.com/w/cpp/keyword/bitor)
- [`not`](https://en.cppreference.com/w/cpp/keyword/not), [`not_eq`](https://en.cppreference.com/w/cpp/keyword/not_eq)
- [`or`](https://en.cppreference.com/w/cpp/keyword/or), [`or_eq`](https://en.cppreference.com/w/cpp/keyword/or_eq)
- [`xor`](https://en.cppreference.com/w/cpp/keyword/xor), [`xor_eq`](https://en.cppreference.com/w/cpp/keyword/xor_eq)
