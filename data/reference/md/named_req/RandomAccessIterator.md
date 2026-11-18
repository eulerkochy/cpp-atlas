# C++ named requirements: LegacyRandomAccessIterator

Source: https://en.cppreference.com/w/cpp/named_req/RandomAccessIterator

A *LegacyRandomAccessIterator* is a *LegacyBidirectionalIterator* that can be moved to point to any element in constant time.

If a *LegacyRandomAccessIterator* `it` originates from a *Container*, then `it`'s `value_type` is the same as the container's, so dereferencing (`*it`) obtains the container's `value_type`.

A pointer to an element of an array satisfies all requirements of *LegacyRandomAccessIterator*.

## Requirements

The type `It` satisfies *LegacyRandomAccessIterator* if

- The type `It` satisfies *LegacyBidirectionalIterator*

And, given

- `value_type`, the type denoted by `std::iterator_traits<It>::value_type`
- `difference_type`, the type denoted by `std::iterator_traits<It>::difference_type`
- `reference`, the type denoted by `std::iterator_traits<It>::reference`
- `i`, `a`, `b`, objects of type `It` or `const It`
- `r`, an lvalue of type `It`
- `n`, an integer of type `difference_type`

The following expressions must be valid and have their specified effects:

**Expression**: `r += n`

**Return type**: `It&`

**Operational semantics**: `difference_type m = n; if (m >= 0) while (m--) ++r; else while (m++) --r; return r;`

**Notes**:

- `n` can be both positive or negative
- The complexity is constant (that is, the implementation cannot actually execute the while loop shown in operational semantics)

**Expression**: `a + n`, `n + a`

**Return type**: `It`

**Operational semantics**: `It temp = a; return temp += n;`

**Notes**:

- `n` can be both positive or negative
- `a + n == n + a`

**Expression**: `r -= n`

**Return type**: `It&`

**Operational semantics**: `return r += -n;`

**Notes**: The absolute value of `n` must be within the range of representable values of `difference_type`.

**Expression**: `i - n`

**Return type**: `It`

**Operational semantics**: `It temp = i; return temp -= n;`

**Expression**: `b - a`

**Return type**: `difference_type`

**Operational semantics**:

`return n;`
(see the precondition)

**Notes**:

Precondition:

- there exists a value `n` of type `difference_type` such that `a + n == b`

Postcondition:

- `b == a + (b - a)`.

**Expression**: `i[n]`

**Return type**: convertible to `reference`

**Operational semantics**: `*(i + n)`

**Expression**: `a < b`

**Return type**: meets *BooleanTestable* (until C++20): models `boolean-testable` (since C++20)

**Operational semantics**: Equivalent to `return b - a > 0;`

**Notes**:

Precondition:

- same as of `b - a`

Strict total ordering relation:

- `!(a < a)`
- if `a < b` then `!(b < a)`
- if `a < b` and `b < c` then `a < c`
- `a < b` or `b < a` or `a == b`
  (exactly one of the expressions is true)

**Expression**: `a > b`

**Return type**: meets *BooleanTestable* (until C++20): models `boolean-testable` (since C++20)

**Operational semantics**: `b < a`

**Notes**: Total ordering relation opposite to `a < b`

**Expression**: `a >= b`

**Return type**: meets *BooleanTestable* (until C++20): models `boolean-testable` (since C++20)

**Operational semantics**: `!(a < b)`

**Expression**: `a <= b`

**Return type**: meets *BooleanTestable* (until C++20): models `boolean-testable` (since C++20)

**Operational semantics**: `!(a > b)`

The above rules imply that *LegacyRandomAccessIterator* also implements *LessThanComparable*.

A *mutable* *LegacyRandomAccessIterator* is a *LegacyRandomAccessIterator* that additionally satisfies the *LegacyOutputIterator* requirements.

(since C++20):

## Concept

For the definition of `std::iterator_traits`, the following exposition-only concept is defined.

```cpp
template<class I>
concept __LegacyRandomAccessIterator =
    __LegacyBidirectionalIterator<I> && std::totally_ordered<I> &&
        requires(I i, typename std::incrementable_traits<I>::difference_type n)
        {
            { i += n } -> std::same_as<I&>;
            { i -= n } -> std::same_as<I&>;
            { i +  n } -> std::same_as<I>;
            { n +  i } -> std::same_as<I>;
            { i -  n } -> std::same_as<I>;
            { i -  i } -> std::same_as<decltype(n)>;
            {  i[n]  } -> std::convertible_to<std::iter_reference_t<I>>;
        };
```

where the exposition-only concept `__LegacyBidirectionalIterator` is described in LegacyBidirectionalIterator.

## Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| LWG 299 (N3066) | C++98 | the return type of `a[n]` was required to be convertible to `const value_type&` | the return type is required to be convertible to `reference` |
| LWG 448 | C++98 | the return type of `a[n]` was required to be convertible to `value_type` | the return type is required to be convertible to `const value_type&`[1] |
| LWG 1079 | C++98 | `b - a` was defined using `a < b`, resulted in circular definition | removed `a < b` from the definition |
| LWG 2114 (P2167R3) | C++98 | convertibility to `bool` was too weak to reflect the expectation of implementations | requirements strengthened |

1. ↑ LWG issue 299 was reopened after this resolution.

## See also

- [`random_access_iterator`](https://en.cppreference.com/w/cpp/iterator/random_access_iterator) (C++20): specifies that a `bidirectional_iterator` is a random-access iterator, supporting advancement in constant time and subscripting (concept)
- [**Iterator library**](https://en.cppreference.com/w/cpp/iterator): provides definitions for iterators, iterator traits, adaptors, and utility functions
