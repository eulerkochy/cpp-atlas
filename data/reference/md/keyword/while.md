# C++ keyword: while

Source: https://en.cppreference.com/w/cpp/keyword/while

## Usage

- `while` loop: as the declaration of the loop
- `do-while` loop: as the declaration of the terminating condition of the loop

## Example

```cpp
#include <iostream>

int main() noexcept
{
    int i{3};

    // The following 'while' loop statement:
    // 1. (condition) Checks if value of the variable 'i' is greater than zero
    //                and if not, ends the loop execution with end of this point.
    //                Post-decrements the variable 'i' (decreases its value by 1).
    // 2. (statement) Writes out a current value of the variable 'i' to the stdout.
    // 3.             Returns to the point 1 (condition).

    while (i --> 0)     // condition: i-- > 0
        std::cout << i; // statement: std::cout << i;
}
```

Output:

```text
210
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
- [`return`](https://en.cppreference.com/w/cpp/language/return) statement: [`return`](https://en.cppreference.com/w/cpp/keyword/return)

(since C++20):

- [`co_return`](https://en.cppreference.com/w/cpp/language/return) statement (return from a coroutine): [`co_return`](https://en.cppreference.com/w/cpp/keyword/co_return)

- [`do-while`](https://en.cppreference.com/w/cpp/language/do) loop and [`while` loop](https://en.cppreference.com/w/cpp/language/while): [`do`](https://en.cppreference.com/w/cpp/keyword/do)
- [`for`](https://en.cppreference.com/w/cpp/language/for) loop and [range-based `for` loop](https://en.cppreference.com/w/cpp/language/range-for): [`for`](https://en.cppreference.com/w/cpp/keyword/for)
