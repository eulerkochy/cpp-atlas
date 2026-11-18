# C++ named requirements: LegacyInputIterator

Source: https://en.cppreference.com/w/cpp/named_req/InputIterator

A *LegacyInputIterator* is a *LegacyIterator* that can read from the pointed-to element. *LegacyInputIterator*s only guarantee validity for single pass algorithms: once a *LegacyInputIterator* `i` has been incremented, all copies of its previous value may be invalidated.

## Requirements

**Type — Definition**

- `X`: An input iterator type
- `T`: The value type of `X` (i.e. `std::iterator_traits<X>::value_type`)
- `R`: `std::iterator_traits<X>::reference`

**Value — Definition**

- `i`, `j`: Values of type `X` or `const X`
- `r`: A value of type `X&`

**Other — Definition**

- `m`: An identifier which possibly denotes a data member or member function

`X` satisfies *LegacyInputIterator* if all following conditions are satisfied:

- `X` satisfies *LegacyIterator*.
- `X` satisfies *EqualityComparable*.
- The following expressions are well-formed and have the specified semantics:

**Expression**: `i != j`

**Type**: a type satisfying *BooleanTestable* (until C++20) a type modeling `boolean-testable` (since C++20)

**Semantics**: Precondition: `i` and `j` are in the domain of `==`.

**Semantics**: Effect: Equivalent to `!(i == j)`.

**Expression**: `*i`

**Type**: `R`, convertible to `T`

**Semantics**: Precondition: `i` is dereferenceable.

**Semantics**:

Effect

- The expression `(void)*i, *i` is equivalent to `*i`.
- If `i` and `j` are in the domain of `==`, and `i == j`, then `*i` is equivalent to `*j`.

**Expression**: `i->m`

**Semantics**: Precondition: `i` is dereferenceable.

**Semantics**: Effect: Equivalent to `(*i).m`.

**Expression**: `++r`

**Type**: `X&`

**Semantics**: Precondition: `r` is dereferenceable.

**Semantics**:

Postcondition

- `r` is dereferenceable or `r` is past-the-end.
- Any copies of the previous value of `r` are no longer required to be either dereferenceable or to be in the domain of `==`.

**Expression**: `(void)r++`

**Semantics**: Effect: Equivalent to `(void)++r`.

**Expression**: `*r++`

**Type**: convertible to `T`

**Semantics**: Effect: Equivalent to `T x = *r; ++r; return x;`.

## Equality domain

The term *the domain of `==`* is used in the ordinary mathematical sense to denote the set of values which can be compared using `==`. This set can change over time.

Each algorithm places additional requirements on the equality domain for the iterator values it uses. These requirements can be inferred from the uses that algorithm makes of `==` and `!=`.

## Notes

For an input iterator `X` that is not a *LegacyForwardIterator*, `std::iterator_traits<X>::reference` does not have to be a reference type: dereferencing an input iterator may return a proxy object or `std::iterator_traits<X>::value_type` itself by value (as in the case of `std::istreambuf_iterator`).

(since C++20):

## Concept

For the definition of `std::iterator_traits`, the following exposition-only concept is defined.

```cpp
template<class I>
concept __LegacyInputIterator =
__LegacyIterator<I> && std::equality_comparable<I> && requires(I i)
{
    typename std::incrementable_traits<I>::difference_type;
    typename std::indirectly_readable_traits<I>::value_type;
    typename std::common_reference_t<std::iter_reference_t<I>&&,
                                     typename std::indirectly_readable_traits<I>::value_type&>;
    *i++;
    typename std::common_reference_t<decltype(*i++)&&,
                                     typename std::indirectly_readable_traits<I>::value_type&>;
    requires std::signed_integral<typename std::incrementable_traits<I>::difference_type>;
};
```

where the exposition-only concept `__LegacyIterator` is described in LegacyIterator.

## Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| LWG 98 | C++98 | the return type of `*i++` was required to be `T` | it can be any type convertible to `T` |
| LWG 2114 (P2167R3) | C++98 | convertibility to `bool` was too weak to reflect the expectation of implementations | requirements strengthened |

## See also

- [`input_iterator`](https://en.cppreference.com/w/cpp/iterator/input_iterator) (C++20): specifies that a type is an input iterator, that is, its referenced values can be read and it can be both pre- and post-incremented (concept)
- [**Iterator library**](https://en.cppreference.com/w/cpp/iterator): provides definitions for iterators, iterator traits, adaptors, and utility functions
