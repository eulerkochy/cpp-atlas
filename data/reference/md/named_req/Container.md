# C++ named requirements: Container

Source: https://en.cppreference.com/w/cpp/named_req/Container

A *Container* is an object used to store other objects and taking care of the management of the memory used by the objects it contains.

## Requirements

Given the following types and values:

**Type — Definition**

- `T`: an object type
- `C`: a container class containing objects of type `T`

**Value — Definition**

- `u`, `v`: values of type `C` or `const C`
- `mv`: a value of type `C`
- `cv`: a value of type `const C`
- `lhs`, `rhs`: lvalues of type `C`
- `i`, `j`: values of type `C::iterator` or `const C::iterator`

`C` satisfies the requirements of *Container* if the following types, statements, and expressions are well-formed and have the specified semantics:

### Types

| Type | Definition | Requirements |
| --- | --- | --- |
| `typename C::value_type` | `T` | `T` is *CopyConstructible* (until C++11) *Erasable* from `C` (since C++11). |
| `typename C::reference` | `T&` | No explicit requirement |
| `typename C::const_reference` | `const T&` | No explicit requirement |
| `typename C::iterator` | an iterator type | - `C::iterator` is a *LegacyForwardIterator*, and its value type is `T`. - `C::iterator` is convertible to `C::const_iterator`. |
| `typename C::const_iterator` | a constant iterator type | `C::const_iterator` is a *LegacyForwardIterator*, and its value type is `T`. |
| `typename C::difference_type` | a signed integer type | `C::difference_type` is the same as the difference type of `C::iterator` and `C::const_iterator`. |
| `typename C::size_type` | an unsigned integer type | `C::size_type` is large enough to represent all non-negative values of `C::difference_type`. |

### Statements

**Statement**: `C c;`, `C c = C();`

**Semantics**: Postcondition: `c.empty()` is `true`.

**Complexity**: constant

**Statement**: `C c(v);`, `C c = C(v);`

**Semantics**: Precondition: If `v` is not an rvalue of type `C`, `T` is *CopyInsertable* into `C`. (since C++11)

**Complexity**: linear[1]

**Semantics**:

Postcondition

- If `v` is an lvalue, `c == v` is `true`.
- If `v` is an rvalue, and `c` and `v` do not refer to the same object (since C++11), `c` is equal to the value that `v` had before this construction.

**Notes**

1. ↑ If `v` is an rvalue of type `C`, and `C` is not a specialization of `std::array` or `std::inplace_vector`, the complexity is constant.

### Expressions

**Expression**: `C()`

**Type**: `C`

**Semantics**: Postcondition: `C().empty()` is `true`.

**Complexity**: constant

**Expression**: `C(v)`

**Type**: `C`

**Semantics**: Precondition: If `v` is not an rvalue of type `C`, `T` is *CopyInsertable* into `C`. (since C++11)

**Complexity**: constant[1]

**Semantics**:

Postcondition

- If `v` is an lvalue, `C(v) == v` is `true`.
- If `v` is an rvalue, and `C(v)` and `v` do not refer to the same object (since C++11), `C(v)` is equal to the value that `v` had before this construction.

**Expression**: `lhs = v`

**Type**: `C&`

**Semantics**:

Postcondition

- If `v` is an lvalue, `lhs == v` is `true`.
- If `v` is an rvalue, and `lv` and `v` do not refer to the same object (since C++11), `lhs` is equal to the value that `v` had before this assignment.

**Complexity**: linear

**Expression**: `v.~C()`

**Type**: `void`

**Semantics**: Effect: Destroys all elements of `v` and deallocates all memory obtained.

**Complexity**: linear

**Expression**: `mv.begin()`

**Type**: `C::iterator`

**Semantics**: Effect: Returns an iterator pointing to the first element of `mv`.

**Complexity**: constant

**Expression**: `cv.begin()`

**Type**: `C::const_iterator`

**Semantics**: Effect: Returns an iterator pointing to the first element of `cv`.

**Complexity**: constant

**Expression**: `mv.end()`

**Type**: `C::iterator`

**Semantics**: Effect: Returns the past-the-end iterator of `mv`.

**Complexity**: constant

**Expression**: `cv.end()`

**Type**: `C::const_iterator`

**Semantics**: Effect: Returns the past-the-end iterator of `cv`.

**Complexity**: constant

**Expression**:

`v.cbegin()`
(since C++11)

**Type**: `C::const_iterator`

**Semantics**: Effect: Returns `const_cast<const C&>(v).begin()`.

**Complexity**: constant

**Expression**:

`v.cend()`
(since C++11)

**Type**: `C::const_iterator`

**Semantics**: Effect: Returns `const_cast<const C&>(v).end()`.

**Complexity**: constant

**Expression**:

`i <=> j`
(since C++20)

**Type**: `std::strong_ordering`

**Semantics**: Constraint: This expression is only required to be well-formed if `C::iterator` satisfies the random access iterator requirements.

**Complexity**: constant

**Expression**: `u == v`

**Type**: `bool`

**Semantics**: Effect: Returns: `u.size() == v.size() && std::equal(u.begin(), u.end(), v.begin())` (until C++14): `std::equal(u.begin(), u.end(), v.begin(), v.end())` (since C++14): .

**Complexity**: linear[2]

**Expression**: `u != v`

**Semantics**: Effect: Equivalent to `!(u == v)`.

**Expression**: `lhs.swap(rhs)`, `swap(lhs, rhs)`

**Type**: `void`

**Semantics**: Effect: Exchanges the contents of `lhs` and `rhs`.

**Complexity**: constant[3]

**Expression**: `v.size()`

**Type**: `C::size_type`

**Semantics**: Effect: Returns the number of elements[4] of `v`.

**Complexity**: constant

**Expression**: `v.max_size()`

**Type**: `C::size_type`

**Semantics**: Effect: Returns the number of elements of the largest possible container of type `C`.

**Complexity**: constant

**Expression**: `v.empty()`

**Type**: `bool`

**Semantics**: Effect: Returns `v.begin() == v.end()`.

**Complexity**: constant

**Optional container requirements(only provided for some types of containers)**

**Expression**:

`u <=> v`
(since C++20)

**Type**:

`synth-three-way-result`
`<C::value_type>`

**Semantics**: Precondition: Either `T` models `three_way_comparable`, or `operator<` is a total ordering relationship defined for values of type `T` and `const T`.

**Complexity**: linear

**Semantics**: Effect: Returns `std::lexicographical_compare_three_way (u.begin(), u.end(), v.begin(), v.end(), synth-three-way)`[5].

**Notes**

1. ↑ If `v` is an rvalue of type `C`, and `C` is a specialization of `std::array` or `std::inplace_vector`, the complexity is linear.
2. ↑ If `u.size() != v.size()` is `true`, the complexity is constant.
3. ↑ If `C` is a specialization of `std::array` or `std::inplace_vector`, the complexity is linear.
4. ↑ The number of elements is defined by the rules of constructors, inserts, and erases. It is equal to the value of `std::distance(v.begin(), v.end())`.
5. ↑ If the iterators passed to `std::lexicographical_compare_three_way` are *ConstexprIterator*s, the operation is implemented by `constexpr` functions.

In the expressions `i == j`, `i != j`, `i < j`, `i <= j`, `i >= j`, `i > j` and `i - j`, if `i` and/or `j` are replaced by iterators of type `C::const_iterator` pointing to the same element respectively, the semantics remain the same.

## Container data races

See container thread safety.

## Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| LWG 179 | C++98 | `iterator` and `const_iterator` types might be incomparable | required to be comparable |
| LWG 276 | C++98 | `T` was required to be *CopyAssignable* | `T` is required to be *CopyConstructible* |
| LWG 322 | C++98 | the value types of `iterator` and `const_iterator` were not specified | specified as `T` |
| LWG 774 | C++98 | there was no requirement on `swap(a, b)` | added |
| LWG 883 | C++98 | `a.swap(b)` was defined as `swap(a, b)`, resulted in circular definition | defined as exchanging the values of `a` and `b` |
| LWG 1319 | C++98 | `iterator` and `const_iterator` might not have multipass guarantee | they are required to satisfy the requirements of *LegacyForwardIterator* |
| LWG 2114 (P2167R3) | C++98 | non-`bool` return types of some functions were allowed | disallowed |
| LWG 2182 | C++98 | the types deonted by `reference` and `const_reference` were poorly specified | improved wording |
| LWG 2257 | C++98 | two containers required linear time to compare equal even if they have different sizes | only requires constant time in this case |
| LWG 2263 | C++11 | the resolution of LWG issue 179 was accidentally dropped in C++11 | restored |
| LWG 2839 | C++11 | self move assignment of standard containers was not allowed | allowed but the result is unspecified |
| N3346 | C++11 | `C::value_type` was required to be *Destructible* | required to be *Erasable* from `C` |

## See also

- [C++ documentation for Containers library](https://en.cppreference.com/w/cpp/container)
