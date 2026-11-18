# std::experimental::shuffle

Source: https://en.cppreference.com/w/cpp/experimental/shuffle

```cpp
// Defined in header <experimental/algorithm>

template< class RandomIt >
void shuffle( RandomIt first, RandomIt last ); // (library fundamentals TS v2)
```

Reorders the elements in the given range `[first,` `last)` such that each possible permutation of those elements has equal probability of appearance, using the per-thread random number engine as the random number generator.

## Parameters

- `first, last` - the range of elements to shuffle randomly
- `RandomIt` must meet the requirements of *ValueSwappable* and *LegacyRandomAccessIterator*.

## Return value

(none)

## Complexity

Linear in the distance between `first` and `last`.

## Example

```cpp
#include <experimental/algorithm>
#include <iostream>
#include <string>

int main()
{
    std::string sample{"ABCDEF"};

    for (int i = 0; i != 4; ++i)
    {
        std::experimental::shuffle(sample.begin(), sample.end());
        std::cout << sample << '\n';
    }
}
```

Possible output:

```text
DACBFE
CDFBAE
BDCAFE
BAFCED
```

## See also

- [`random_shuffle`](https://en.cppreference.com/w/cpp/algorithm/random_shuffle) (until C++17), [`shuffle`](https://en.cppreference.com/w/cpp/algorithm/random_shuffle) (C++11): randomly re-orders elements in a range (function template)
