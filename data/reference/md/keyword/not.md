# C++ keyword: not

Source: https://en.cppreference.com/w/cpp/keyword/not

## Usage

- alternative operators: as an alternative for `!`

## Example

```cpp
#include <iostream>

void show(bool z, const char* s, int n)
{
    const char* r{z ? " true  " : " false "};
    if (n == 0) std::cout << "┌───────────┬─────────┐\n";
    if (n <= 1) std::cout << "│ " <<s<< " │ "<<r<<" │\n";
    if (n == 1) std::cout << "└───────────┴─────────┘\n";
}

int main()
{
    show(not true , "not true ", 0);
    show(not false, "not false", 1);
}
```

Output:

```text
┌───────────┬─────────┐
│ not true  │  false  │
│ not false │  true   │
└───────────┴─────────┘
```

## See also

- [`and`](https://en.cppreference.com/w/cpp/keyword/and), [`and_eq`](https://en.cppreference.com/w/cpp/keyword/and_eq)
- [`bitand`](https://en.cppreference.com/w/cpp/keyword/bitand), [`bitor`](https://en.cppreference.com/w/cpp/keyword/bitor)
- [`not_eq`](https://en.cppreference.com/w/cpp/keyword/not_eq)
- [`or`](https://en.cppreference.com/w/cpp/keyword/or), [`or_eq`](https://en.cppreference.com/w/cpp/keyword/or_eq)
- [`xor`](https://en.cppreference.com/w/cpp/keyword/xor), [`xor_eq`](https://en.cppreference.com/w/cpp/keyword/xor_eq)
