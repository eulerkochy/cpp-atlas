# C++ keyword: not_eq

Source: https://en.cppreference.com/w/cpp/keyword/not_eq

## Usage

- alternative operators: as an alternative for `!=`

## Example

```cpp
#include <iostream>

void show(bool z, const char* s, int n)
{
    const char* r { z ? " true  " : " false " };
    if (n == 0) std::cout << "┌────────────────────┬─────────┐\n";
    if (n <= 2) std::cout << "│ "      <<s<<     " │ "<<r<<" │\n";
    if (n == 2) std::cout << "└────────────────────┴─────────┘\n";
}

int main()
{
    show(false not_eq false, "false not_eq false", 0);
    show(false not_eq true , "false not_eq true ", 1);
    show(true  not_eq false, "true  not_eq false", 1);
    show(true  not_eq true , "true  not_eq true ", 2);
}
```

Output:

```text
┌────────────────────┬─────────┐
│ false not_eq false │  false  │
│ false not_eq true  │  true   │
│ true  not_eq false │  true   │
│ true  not_eq true  │  false  │
└────────────────────┴─────────┘
```

## See also

- [`and`](https://en.cppreference.com/w/cpp/keyword/and), [`and_eq`](https://en.cppreference.com/w/cpp/keyword/and_eq)
- [`bitand`](https://en.cppreference.com/w/cpp/keyword/bitand), [`bitor`](https://en.cppreference.com/w/cpp/keyword/bitor)
- [`not`](https://en.cppreference.com/w/cpp/keyword/not)
- [`or`](https://en.cppreference.com/w/cpp/keyword/or), [`or_eq`](https://en.cppreference.com/w/cpp/keyword/or_eq)
- [`xor`](https://en.cppreference.com/w/cpp/keyword/xor), [`xor_eq`](https://en.cppreference.com/w/cpp/keyword/xor_eq)
