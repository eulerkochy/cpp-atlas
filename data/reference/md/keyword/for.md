# C++ keyword: for

Source: https://en.cppreference.com/w/cpp/keyword/for

## Usage

- `for` loop: as the declaration of the loop

(since C++11):

- range-based `for` loop: as the declaration of the loop

## Example

```cpp
#include <iostream>

int main() noexcept
{
    // The following 'for' loop statement:
    // 1. (init-statement) Declares an integer named 'i' and initializes it with value '0'.
    // 2. (condition)      Checks if i is less than 3 and if not, ends the loop execution.
    // 3. (statement)      Writes out a current value of the integer 'i' to the stdout.
    // 4. (expression)     Pre-increments the integer 'i' (increases its value by 1).
    // 5.                  Returns to the point 2 (condition).

                                // init-statement: int i{0};
                                // condition:      i < 3
    for (int i{0}; i < 3; ++i)  // expression:     ++i
        std::cout << i;         // statement:      std::cout << i;
}
```

Output:

```text
012
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

- [`do-while`](https://en.cppreference.com/w/cpp/language/do) loop and [`while` loop](https://en.cppreference.com/w/cpp/language/while): [`do`](https://en.cppreference.com/w/cpp/keyword/do), [`while`](https://en.cppreference.com/w/cpp/keyword/while)
