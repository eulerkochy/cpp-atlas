# C++ keyword: or

Source: https://en.cppreference.com/w/cpp/keyword/or

## Usage

- alternative operators: as an alternative for `||`

## Example

```cpp
#include <iostream>

void show(bool z, const char* s, int n)
{
    const char* r{z ? " true  " : " false "};
    if (n == 0) std::cout << "┌────────────────┬─────────┐\n";
    if (n <= 2) std::cout << "│ "   <<s<<    " │ "<<r<<" │\n";
    if (n == 2) std::cout << "└────────────────┴─────────┘\n";
}

int main()
{
    show(false or false, "false or false", 0);
    show(false or true , "false or true ", 1);
    show(true  or false, "true  or false", 1);
    show(true  or true , "true  or true ", 2);
}
```

Output:

```text
┌────────────────┬─────────┐
│ false or false │  false  │
│ false or true  │  true   │
│ true  or false │  true   │
│ true  or true  │  true   │
└────────────────┴─────────┘
```

## See also

- [`and`](https://en.cppreference.com/w/cpp/keyword/and), [`and_eq`](https://en.cppreference.com/w/cpp/keyword/and_eq)
- [`bitand`](https://en.cppreference.com/w/cpp/keyword/bitand), [`bitor`](https://en.cppreference.com/w/cpp/keyword/bitor)
- [`not`](https://en.cppreference.com/w/cpp/keyword/not), [`not_eq`](https://en.cppreference.com/w/cpp/keyword/not_eq)
- [`or_eq`](https://en.cppreference.com/w/cpp/keyword/or_eq)
- [`xor`](https://en.cppreference.com/w/cpp/keyword/xor), [`xor_eq`](https://en.cppreference.com/w/cpp/keyword/xor_eq)
