# C++ keyword: xor_eq

Source: https://en.cppreference.com/w/cpp/keyword/xor_eq

## Usage

- alternative operators: as an alternative for `^=`

## Example

```cpp
#include <bitset>
#include <iostream>

using bin = std::bitset<8>;

void show(bin z, const char* s, int n)
{
    if (n == 0) std::cout << "┌────────────┬──────────┐\n";
    if (n <= 2) std::cout << "│ " <<s<<  " │ " <<z<<" │\n";
    if (n == 2) std::cout << "└────────────┴──────────┘\n";
}

int main()
{
    bin x{"01011010"}; show(x, "x         ", 0);
    bin y{"00111100"}; show(y, "y         ", 1);
    x xor_eq y;        show(x, "x xor_eq y", 2);
}
```

Output:

```text
┌────────────┬──────────┐
│ x          │ 01011010 │
│ y          │ 00111100 │
│ x xor_eq y │ 01100110 │
└────────────┴──────────┘
```

## See also

- [`and`](https://en.cppreference.com/w/cpp/keyword/and), [`and_eq`](https://en.cppreference.com/w/cpp/keyword/and_eq)
- [`bitand`](https://en.cppreference.com/w/cpp/keyword/bitand), [`bitor`](https://en.cppreference.com/w/cpp/keyword/bitor)
- [`not`](https://en.cppreference.com/w/cpp/keyword/not), [`not_eq`](https://en.cppreference.com/w/cpp/keyword/not_eq)
- [`or`](https://en.cppreference.com/w/cpp/keyword/or), [`or_eq`](https://en.cppreference.com/w/cpp/keyword/or_eq)
- [`xor`](https://en.cppreference.com/w/cpp/keyword/xor)
