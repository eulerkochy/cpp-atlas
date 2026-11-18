# C++ keyword: return

Source: https://en.cppreference.com/w/cpp/keyword/return

## Usage

- `return` statement: as the declaration of the statement

## Example

```cpp
#include <cstdlib>
#include <iostream>

[[nodiscard]] constexpr auto clamp(int value, int min, int max) noexcept
{
    if (value <= min)
        return min;
    else if (max <= value)
        return max;

    return value;
    // won't be executed past 'return' statement

    std::exit(value);
}

int main() noexcept
{
    std::cout << clamp(1, 2, 4);
    std::cout << clamp(3, 2, 4);
    std::cout << clamp(5, 2, 4);

    return 0; // the value '0' that in main() indicates a success
}
```

Output:

```text
234
```

## See also

- [`if`](https://en.cppreference.com/w/cpp/language/if) statement: [`if`](https://en.cppreference.com/w/cpp/keyword/if), [`else`](https://en.cppreference.com/w/cpp/keyword/else)

(since C++17):

- [`constexpr` `if` statement](https://en.cppreference.com/w/cpp/language/if#Constexpr_if): [`constexpr`](https://en.cppreference.com/w/cpp/keyword/constexpr) (`constexpr` `if` statement)

(since C++23):

- [`consteval` `if` statement](https://en.cppreference.com/w/cpp/language/if#Consteval_if): [`consteval`](https://en.cppreference.com/w/cpp/keyword/consteval) (`consteval` `if` statement)

- [`switch`](https://en.cppreference.com/w/cpp/language/switch) statement: [`switch`](https://en.cppreference.com/w/cpp/keyword/switch), [`case`](https://en.cppreference.com/w/cpp/keyword/case)
- [`default`](https://en.cppreference.com/w/cpp/language/switch) (as case label declaration) etc: [`default`](https://en.cppreference.com/w/cpp/keyword/default)
- [`goto`](https://en.cppreference.com/w/cpp/language/goto) statement: [`goto`](https://en.cppreference.com/w/cpp/keyword/goto)
- [`continue`](https://en.cppreference.com/w/cpp/language/continue) statement: [`continue`](https://en.cppreference.com/w/cpp/keyword/continue)
- [`break`](https://en.cppreference.com/w/cpp/language/break) statement: [`break`](https://en.cppreference.com/w/cpp/keyword/break)

(since C++20):

- [`co_return`](https://en.cppreference.com/w/cpp/language/return) statement (return from a coroutine): [`co_return`](https://en.cppreference.com/w/cpp/keyword/co_return)

- [`do-while`](https://en.cppreference.com/w/cpp/language/do) loop and [`while` loop](https://en.cppreference.com/w/cpp/language/while): [`do`](https://en.cppreference.com/w/cpp/keyword/do), [`while`](https://en.cppreference.com/w/cpp/keyword/while)
- [`for`](https://en.cppreference.com/w/cpp/language/for) loop and [range-based `for` loop](https://en.cppreference.com/w/cpp/language/range-for): [`for`](https://en.cppreference.com/w/cpp/keyword/for)
