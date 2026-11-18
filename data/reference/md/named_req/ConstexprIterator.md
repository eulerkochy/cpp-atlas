# C++ named requirements: ConstexprIterator (since C++20)

Source: https://en.cppreference.com/w/cpp/named_req/ConstexprIterator

A *ConstexprIterator* is a *LegacyIterator* that can be used during constant expression evaluation.

## Requirements

The type `It` satisfies *ConstexprIterator* if

- The type `It` satisfies some iterator requirements *MeowIterator*

And, for every

- `purr`, an operation on `It` that is required to be supported by *MeowIterator*,
- `kittens...`, a set of arguments to `purr` that meets the requirements for that operation,

Then

- `purr(kittens...)` may be used in a constant expression if `kittens...` can also be used.

## Standard library

The following standard library types are *ConstexprIterator*s.

- `array::iterator` and `array::const_iterator`.
- `basic_string_view::iterator`.
- `span::iterator`.
- `vector::iterator` and `vector::const_iterator`.

(since C++26):

- `optional::iterator` and `optional::const_iterator`

## See also

- [**Iterator library**](https://en.cppreference.com/w/cpp/iterator): provides definitions for iterators, iterator traits, adaptors, and utility functions
