# std::match_results<BidirIt,Alloc>::end, std::match_results<BidirIt,Alloc>::cend

Source: https://en.cppreference.com/w/cpp/regex/match_results/end

```cpp
iterator end() noexcept; // (since C++11)
const_iterator end() const noexcept; // (since C++11)
const_iterator cend() const noexcept; // (since C++11)
```

Returns an iterator to the end of the list of sub-matches.

## Parameters

(none)

## Return value

Iterator to the element past the last sub-match.

## Complexity

Constant.

## See also

- [`begin`](https://en.cppreference.com/w/cpp/regex/match_results/begin), [`cbegin`](https://en.cppreference.com/w/cpp/regex/match_results/begin): returns iterator to the beginning of the list of sub-matches (public member function)
