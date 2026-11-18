# synth-three-way, synth-three-way-result

Source: https://en.cppreference.com/w/cpp/standard_library/synth-three-way

```cpp
constexpr auto synth-three-way = /* see below */; // (1) (since C++20) (exposition only*)

template< class T, class U = T >
using synth-three-way-result =
    decltype(synth-three-way(std::declval<T&>(), std::declval<U&>())); // (2) (since C++20) (exposition only*)
```

1) A function object whose `operator()` behaves as the synthesized three-way comparison function. Equivalent to:

   ```cpp
   constexpr auto synth-three-way =
       []<class T, class U>(const T& t, const U& u)
           requires requires
           {
               { t < u } -> boolean-testable;
               { u < t } -> boolean-testable;
           }
       {
           if constexpr (std::three_way_comparable_with<T, U>)
               return t <=> u;
           else
           {
               if (t < u)
                   return std::weak_ordering::less;
               if (u < t)
                   return std::weak_ordering::greater;
               return std::weak_ordering::equivalent;
           }
       };
   ```

2) The return type of the `operator()` of (1) (`synth-three-way`).

## Parameters

- `t, u` - the values to be compared

## Return value

The compare result.

## See also

- [`operator==`](https://en.cppreference.com/w/cpp/utility/pair/operator_cmp), [`operator!=`](https://en.cppreference.com/w/cpp/utility/pair/operator_cmp) (removed in C++20), [`operator<`](https://en.cppreference.com/w/cpp/utility/pair/operator_cmp) (removed in C++20), [`operator<=`](https://en.cppreference.com/w/cpp/utility/pair/operator_cmp) (removed in C++20), [`operator>`](https://en.cppreference.com/w/cpp/utility/pair/operator_cmp) (removed in C++20), [`operator>=`](https://en.cppreference.com/w/cpp/utility/pair/operator_cmp) (removed in C++20), [`operator<=>`](https://en.cppreference.com/w/cpp/utility/pair/operator_cmp) (C++20): lexicographically compares the values in the `pair` (function template)
- [`operator==`](https://en.cppreference.com/w/cpp/utility/tuple/operator_cmp), [`operator!=`](https://en.cppreference.com/w/cpp/utility/tuple/operator_cmp) (removed in C++20), [`operator<`](https://en.cppreference.com/w/cpp/utility/tuple/operator_cmp) (removed in C++20), [`operator<=`](https://en.cppreference.com/w/cpp/utility/tuple/operator_cmp) (removed in C++20), [`operator>`](https://en.cppreference.com/w/cpp/utility/tuple/operator_cmp) (removed in C++20), [`operator>=`](https://en.cppreference.com/w/cpp/utility/tuple/operator_cmp) (removed in C++20), [`operator<=>`](https://en.cppreference.com/w/cpp/utility/tuple/operator_cmp) (C++20): lexicographically compares the values in the tuple (function template)
- [`operator==`](https://en.cppreference.com/w/cpp/container/array/operator_cmp) (C++11), [`operator!=`](https://en.cppreference.com/w/cpp/container/array/operator_cmp) (C++11)(removed in C++20), [`operator<`](https://en.cppreference.com/w/cpp/container/array/operator_cmp) (C++11)(removed in C++20), [`operator<=`](https://en.cppreference.com/w/cpp/container/array/operator_cmp) (C++11)(removed in C++20), [`operator>`](https://en.cppreference.com/w/cpp/container/array/operator_cmp) (C++11)(removed in C++20), [`operator>=`](https://en.cppreference.com/w/cpp/container/array/operator_cmp) (C++11)(removed in C++20), [`operator<=>`](https://en.cppreference.com/w/cpp/container/array/operator_cmp) (C++20): lexicographically compares the values of two `array`s (function template)
- [`operator==`](https://en.cppreference.com/w/cpp/container/deque/operator_cmp), [`operator!=`](https://en.cppreference.com/w/cpp/container/deque/operator_cmp) (removed in C++20), [`operator<`](https://en.cppreference.com/w/cpp/container/deque/operator_cmp) (removed in C++20), [`operator<=`](https://en.cppreference.com/w/cpp/container/deque/operator_cmp) (removed in C++20), [`operator>`](https://en.cppreference.com/w/cpp/container/deque/operator_cmp) (removed in C++20), [`operator>=`](https://en.cppreference.com/w/cpp/container/deque/operator_cmp) (removed in C++20), [`operator<=>`](https://en.cppreference.com/w/cpp/container/deque/operator_cmp) (C++20): lexicographically compares the values of two `deque`s (function template)
- [`operator==`](https://en.cppreference.com/w/cpp/container/forward_list/operator_cmp) (C++11), [`operator!=`](https://en.cppreference.com/w/cpp/container/forward_list/operator_cmp) (C++11)(removed in C++20), [`operator<`](https://en.cppreference.com/w/cpp/container/forward_list/operator_cmp) (C++11)(removed in C++20), [`operator<=`](https://en.cppreference.com/w/cpp/container/forward_list/operator_cmp) (C++11)(removed in C++20), [`operator>`](https://en.cppreference.com/w/cpp/container/forward_list/operator_cmp) (C++11)(removed in C++20), [`operator>=`](https://en.cppreference.com/w/cpp/container/forward_list/operator_cmp) (C++11)(removed in C++20), [`operator<=>`](https://en.cppreference.com/w/cpp/container/forward_list/operator_cmp) (C++20): lexicographically compares the values of two `forward_list`s (function template)
- [`operator==`](https://en.cppreference.com/w/cpp/container/list/operator_cmp), [`operator!=`](https://en.cppreference.com/w/cpp/container/list/operator_cmp) (removed in C++20), [`operator<`](https://en.cppreference.com/w/cpp/container/list/operator_cmp) (removed in C++20), [`operator<=`](https://en.cppreference.com/w/cpp/container/list/operator_cmp) (removed in C++20), [`operator>`](https://en.cppreference.com/w/cpp/container/list/operator_cmp) (removed in C++20), [`operator>=`](https://en.cppreference.com/w/cpp/container/list/operator_cmp) (removed in C++20), [`operator<=>`](https://en.cppreference.com/w/cpp/container/list/operator_cmp) (C++20): lexicographically compares the values of two `list`s (function template)
- [`operator==`](https://en.cppreference.com/w/cpp/container/vector/operator_cmp), [`operator!=`](https://en.cppreference.com/w/cpp/container/vector/operator_cmp) (removed in C++20), [`operator<`](https://en.cppreference.com/w/cpp/container/vector/operator_cmp) (removed in C++20), [`operator<=`](https://en.cppreference.com/w/cpp/container/vector/operator_cmp) (removed in C++20), [`operator>`](https://en.cppreference.com/w/cpp/container/vector/operator_cmp) (removed in C++20), [`operator>=`](https://en.cppreference.com/w/cpp/container/vector/operator_cmp) (removed in C++20), [`operator<=>`](https://en.cppreference.com/w/cpp/container/vector/operator_cmp) (C++20): lexicographically compares the values of two `vector`s (function template)
- [`operator==`](https://en.cppreference.com/w/cpp/container/map/operator_cmp), [`operator!=`](https://en.cppreference.com/w/cpp/container/map/operator_cmp) (removed in C++20), [`operator<`](https://en.cppreference.com/w/cpp/container/map/operator_cmp) (removed in C++20), [`operator<=`](https://en.cppreference.com/w/cpp/container/map/operator_cmp) (removed in C++20), [`operator>`](https://en.cppreference.com/w/cpp/container/map/operator_cmp) (removed in C++20), [`operator>=`](https://en.cppreference.com/w/cpp/container/map/operator_cmp) (removed in C++20), [`operator<=>`](https://en.cppreference.com/w/cpp/container/map/operator_cmp) (C++20): lexicographically compares the values of two `map`s (function template)
- [`operator==`](https://en.cppreference.com/w/cpp/container/multimap/operator_cmp), [`operator!=`](https://en.cppreference.com/w/cpp/container/multimap/operator_cmp) (removed in C++20), [`operator<`](https://en.cppreference.com/w/cpp/container/multimap/operator_cmp) (removed in C++20), [`operator<=`](https://en.cppreference.com/w/cpp/container/multimap/operator_cmp) (removed in C++20), [`operator>`](https://en.cppreference.com/w/cpp/container/multimap/operator_cmp) (removed in C++20), [`operator>=`](https://en.cppreference.com/w/cpp/container/multimap/operator_cmp) (removed in C++20), [`operator<=>`](https://en.cppreference.com/w/cpp/container/multimap/operator_cmp) (C++20): lexicographically compares the values of two `multimap`s (function template)
- [`operator==`](https://en.cppreference.com/w/cpp/container/set/operator_cmp), [`operator!=`](https://en.cppreference.com/w/cpp/container/set/operator_cmp) (removed in C++20), [`operator<`](https://en.cppreference.com/w/cpp/container/set/operator_cmp) (removed in C++20), [`operator<=`](https://en.cppreference.com/w/cpp/container/set/operator_cmp) (removed in C++20), [`operator>`](https://en.cppreference.com/w/cpp/container/set/operator_cmp) (removed in C++20), [`operator>=`](https://en.cppreference.com/w/cpp/container/set/operator_cmp) (removed in C++20), [`operator<=>`](https://en.cppreference.com/w/cpp/container/set/operator_cmp) (C++20): lexicographically compares the values of two `set`s (function template)
- [`operator==`](https://en.cppreference.com/w/cpp/container/multiset/operator_cmp), [`operator!=`](https://en.cppreference.com/w/cpp/container/multiset/operator_cmp) (removed in C++20), [`operator<`](https://en.cppreference.com/w/cpp/container/multiset/operator_cmp) (removed in C++20), [`operator<=`](https://en.cppreference.com/w/cpp/container/multiset/operator_cmp) (removed in C++20), [`operator>`](https://en.cppreference.com/w/cpp/container/multiset/operator_cmp) (removed in C++20), [`operator>=`](https://en.cppreference.com/w/cpp/container/multiset/operator_cmp) (removed in C++20), [`operator<=>`](https://en.cppreference.com/w/cpp/container/multiset/operator_cmp) (C++20): lexicographically compares the values of two `multiset`s (function template)
