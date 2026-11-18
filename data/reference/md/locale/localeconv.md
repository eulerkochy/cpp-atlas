# std::localeconv

Source: https://en.cppreference.com/w/cpp/locale/localeconv

```cpp
// Defined in header <clocale>
std::lconv* localeconv();
```

The `localeconv` function obtains a pointer to a static object of type `std::lconv`, which represents numeric and monetary formatting rules of the current C locale.

## Parameters

(none)

## Return value

Pointer to the current `std::lconv` object.

## Notes

Modifying the object references through the returned pointer is undefined behavior.

`std::localeconv` modifies a static object, calling it from different threads without synchronization is undefined behavior.

## Example

```cpp
#include <clocale>
#include <iostream>

int main()
{
    std::setlocale(LC_ALL, "ja_JP.UTF-8");
    std::lconv* lc = std::localeconv();
    std::cout << "Japanese currency symbol: " << lc->currency_symbol
              << '(' << lc->int_curr_symbol << ")\n";
}
```

Output:

```text
Japanese currency symbol: ￥(JPY )
```

## See also

- [`setlocale`](https://en.cppreference.com/w/cpp/locale/setlocale): gets and sets the current C locale (function)
- [`lconv`](https://en.cppreference.com/w/cpp/locale/lconv): formatting details, returned by `std::localeconv` (class)
- [C documentation for `localeconv`](https://en.cppreference.com/w/c/locale/localeconv)
