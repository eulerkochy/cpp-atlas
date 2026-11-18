# C++ keyword: compl

Source: https://en.cppreference.com/w/cpp/keyword/compl

## Usage

- alternative operators: as an alternative for `~`

## Example

```cpp
#include <bitset>
#include <iostream>

using bin = std::bitset<8>;

void show(bin z, const char* s, int n)
{
    if (n == 0) std::cout << "┌─────────┬──────────┐\n";
    if (n <= 2) std::cout << "│ "<<s<<" │ " <<z<<" │\n";
    if (n == 2) std::cout << "└─────────┴──────────┘\n";
}

struct A
{
    compl A() { std::cout << "A dtor\n"; }
};

int main()
{
    bin x{"01011010"}; show(x, "x      ", 0);
    bin z = compl x;   show(z, "compl x", 2);
    A a;
}
```

Output:

```text
┌─────────┬──────────┐
│ x       │ 01011010 │
│ compl x │ 10100101 │
└─────────┴──────────┘
A dtor
```

## See also

- [`and`](https://en.cppreference.com/w/cpp/keyword/and), [`and_eq`](https://en.cppreference.com/w/cpp/keyword/and_eq)
- [`bitand`](https://en.cppreference.com/w/cpp/keyword/bitand), [`bitor`](https://en.cppreference.com/w/cpp/keyword/bitor)
- [`not`](https://en.cppreference.com/w/cpp/keyword/not), [`not_eq`](https://en.cppreference.com/w/cpp/keyword/not_eq)
- [`or`](https://en.cppreference.com/w/cpp/keyword/or), [`or_eq`](https://en.cppreference.com/w/cpp/keyword/or_eq)
- [`xor`](https://en.cppreference.com/w/cpp/keyword/xor), [`xor_eq`](https://en.cppreference.com/w/cpp/keyword/xor_eq)
