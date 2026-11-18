# C++ named requirements: SequenceContainer

Source: https://en.cppreference.com/w/cpp/named_req/SequenceContainer

A *SequenceContainer* is a *Container* that stores objects of the same type in a linear arrangement.

## Requirements

Given the following types and values:

**Type — Definition**

- `C`: a sequence container class
- `T`: the element type of `C`
- `A`: the allocator type of `C`: - `C::allocator_type` if it exists, - otherwise `std::allocator<T>`
- `R` (since C++23): a type that models `container-compatible-range` `<T>`
- `Args` (since C++11): a template parameter pack
- `Iter`: `C::iterator`
- `Ref`: `C::reference`
- `CRef`: `C::const_reference`

**Value — Definition**

- `v`: a value of type `C`
- `cv`: a value of type `const C`
- `i`, `j`: *LegacyInputIterator*s such that `[i,` `j)` is a valid range and that the iterators refer to elements implicitly convertible to `C::value_type`
- `rg` (since C++23): a value of type `R`
- `il` (since C++11): a value of type `std::initializer_list<C::value_type>`
- `n`: a value of type `C::size_type`
- `p`: a valid const iterator into `v`
- `q`: a valid dereferenceable const iterator into `v`
- `q1`, `q2`: const iterators into `v` such that `[q1,` `q2)` is a valid range
- `t`: a value (until C++11) an lvalue or const rvalue (since C++11) of type `C::value_type`
- `rv` (since C++11): a non-const rvalue of type `C::value_type`
- `args` (since C++11): a function parameter pack with the pattern `Arg&&`

`C` satisfies the requirements of *SequenceContainer* if all following conditions are satisfied:

- `C` satisfies the requirements of *Container*.
- The following statements and expressions are well-formed and have the specified semantics:

**Statement Semantics[1]**

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `C c(n, t);`, Effect, Constructs the sequence container holding `n` copies of `t`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *CopyInsertable* into `C`. (since C++11)

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Postcondition: `std::distance(c.begin(), c.end())` is `n`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`C c(i, j);`

Effect

Constructs the sequence container equal, element-wise, to the range `[i,` `j)`.

- Each iterator in the range `[i,` `j)` is dereferenced exactly once.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *EmplaceConstructible* into `C` from `*i`. (since C++11)

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Postcondition: `std::distance(c.begin(), c.end())` is `std::distance(i, j)`.

**Expression Type Semantics**

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`C(std::from_range, rg)`
(since C++23)

`C`

Effect

Constructs the sequence container equal, element-wise, to the range `rg`.

- Each iterator in the range `rg` is dereferenced exactly once.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *EmplaceConstructible* into `X` from `*ranges::begin(rg)`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Postcondition: `std::distance(begin(), end())` is `ranges::distance(rg)`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`C(il)`
(since C++11)

`C`

Equivalent to `C(il.begin(), il.end())`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v = il`
(since C++11)

`C&`

Effect

Assigns the range represented by `il` into `v`.[2]

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: `*this`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *CopyInsertable* into `C` and *CopyAssignable*.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Postcondition: Existing elements of `v` are either destroyed or assigned to.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.emplace(p, args)`
(since C++11)

`Iter`

Effect

Insert an object of type `T`, constructed with `std::forward<Args>(args)...` before `p`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: An iterator that points to the new element constructed from `args` into `v`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *EmplaceConstructible* into `C` from `args`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `v.insert(p, t)`, `Iter`, Effect, Inserts a copy of `t` before `p`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: An iterator that points to the copy of `t` inserted into `v`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *CopyInsertable* into `C`. (since C++11)

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.insert(p, rv)`
(since C++11)

`Iter`

Effect

Inserts a copy of `rv` before `p`, possibly using move semantics.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: An iterator that points to the copy of `rv` inserted into `v`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *MoveInsertable* into `C`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `v.insert(p, n, t)`, `Iter`, Effect, Inserts `n` copies of `t` before `p`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: An iterator that points to the copy of the first element inserted into `v`, or `p` if `n` is `​0​`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *CopyInsertable* into `C` and *CopyAssignable*. (since C++11)

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.insert(p, i, j)`

`Iter`

Effect

Inserts copies of elements in `[i,` `j)` before `p`.

- Each iterator in the range `[i,` `j)` is dereferenced exactly once.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: An iterator that points to the copy of the first element inserted into `v`, or `p` if `i == j` is `true`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

Precondition

(since C++11):

- `T` is *EmplaceConstructible* into `C` from `*i`.

- `i` and `j` are not in `v`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.insert_range(p, rg)`
(since C++23)

`Iter`

Effect

Inserts copies of elements in `rg` before `p`.

- Each iterator in the range `rg` is dereferenced exactly once.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: An iterator that points to the copy of the first element inserted into `v`, or `p` if `rg` is empty.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

Precondition

- `T` is *EmplaceConstructible* into `C` from `*ranges::begin(rg)`.
- `rg` and `v` do not overlap.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.insert(p, il)`
(since C++11)

`Iter`

Equivalent to `v.insert(p, il.begin(), il.end())`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `v.erase(q)`, `Iter`, Effect, Erases the element pointed to by `q`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: An iterator that points to the element immediately following `q` prior to the element being erased, or `v.end()` if no such element exists.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `v.erase(q1, q2)`, `Iter`, Effect, Erases elements in `[q1,` `q2)`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: An iterator that points to the element pointed to by `q2` prior to any elements being erased, or `v.end()` if no such element exists.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.clear()`

`void`

Effect

Destroys all elements in `v`.

- Invalidates all references, pointers, and iterators referring to the elements of `v` and may invalidate the past-the-end iterator.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Postcondition: `v.empty()` is `true`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Complexity: Linear.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.assign(i, j)`

`void`

Effect

Replaces elements in `v` with a copy of `[i,` `j)`.

- Invalidates all references, pointers and iterators referring to the elements of `v`.
- Each iterator in `[i,` `j)` is dereferenced exactly once.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

Precondition

(since C++11):

- `T` is *EmplaceConstructible* into `C` from `*i`.
- `T` is assignable from `*i`.

- `i` and `j` are not in `v`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.assign_range(rg)`
(since C++23)

`void`

Effect

Replaces elements in `v` with a copy of each element in `rg`.

- If `std::assignable_from <T&, ranges::range_reference_t<R>>` is not modeled, the program is ill-formed.
- Invalidates all references, pointers and iterators referring to the elements of `v`.
- Each iterator in the range `rg` is dereferenced exactly once.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

Precondition

- `T` is *EmplaceConstructible* into `C` from `*ranges::begin(rg)`.
- `rg` and `v` do not overlap.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.assign(il)`
(since C++11)

`void`

Equivalent to `v.assign(il.begin(), il.end())`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `v.assign(n, t)`, `void`, Effect, Replaces elements in `v` with `n` copies of `t`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *CopyInsertable* into `C` and *CopyAssignable*. (since C++11)

**Extra operations[3](only required for specified sequence containers, omitting std::)**

**Expression Type Semantics**

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `v.front()`, `Ref`, Containers, `basic_string, array, vector, inplace_vector, deque, list, forward_list`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: `*v.begin()`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `cv.front()`, `CRef`, Containers, `basic_string, array, vector, inplace_vector, deque, list, forward_list`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: `*cv.begin()`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `v.back()`, `Ref`, Containers, `basic_string, array, vector, inplace_vector, deque, list`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Equivalent to `auto tmp = v.end(); --tmp; return *tmp;`[4].

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `cv.back()`, `CRef`, Containers, `basic_string, array, vector, inplace_vector, deque, list`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Equivalent to `auto tmp = cv.end(); --tmp; return *tmp;`[5].

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.emplace_front(args)`
(since C++11)

`void`

Containers

`deque, list, forward_list`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Effect: Prepends an object of type `T` constructed with `std::forward<Args>(args)...`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: `v.front()`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *EmplaceConstructible* into `C` from `args`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.emplace_back(args)`
(since C++11)

`void`

Containers

`vector, inplace_vector, deque, list`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Effect: Appends an object of type `T` constructed with `std::forward<Args>(args)...`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: `v.back()`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *EmplaceConstructible* into `C` from `args`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `v.push_front(t)`, `void`, Containers, `deque, list, forward_list`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Effect: Prepends a copy of `t`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *CopyInsertable* into `C`. (since C++11)

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.push_front(rv)`
(since C++11)

`void`

Containers

`deque, list, forward_list`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Effect: Prepends a copy of `rv`, possibly using move semantics.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *MoveInsertable* into `C`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.prepend_range(rg)`
(since C++23)

`void`

Containers

`deque, list, forward_list`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

Effect

Inserts[6] copies of elements in `rg` before `v.begin()`.

- Each iterator in the range `rg` is dereferenced exactly once.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *EmplaceConstructible* into `C` from `*ranges::begin(rg)`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `v.push_back(t)`, `void`, Containers, `basic_string, vector, inplace_vector, deque, list`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Effect: Appends a copy of `t`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *CopyInsertable* into `C`. (since C++11)

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.push_back(rv)`
(since C++11)

`void`

Containers

`basic_string, vector, inplace_vector, deque, list`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Effect: Appends a copy of `rv`, possibly using move semantics.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *MoveInsertable* into `C`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

`v.append_range(rg)`
(since C++23)

`void`

Containers

`vector, inplace_vector, deque, list`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**:

Effect

Inserts[6] copies of elements in `rg` before `v.end()`.

- Each iterator in the range `rg` is dereferenced exactly once.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `T` is *EmplaceConstructible* into `C` from `*ranges::begin(rg)`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `v.pop_front()`, `void`, Containers, `deque, list, forward_list`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Effect: Destroys the first element.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `a.empty()` is `false`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `v.pop_back()`, `void`, Containers, `basic_string, vector, inplace_vector, deque, list`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Effect: Destroys the last element.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Precondition: `a.empty()` is `false`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `v[n]`, `Ref`, Containers, `basic_string, array, vector, inplace_vector, deque`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Equivalent to `return *(v.begin() + n);`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `cv[n]`, `CRef`, Containers, `basic_string, array, vector, inplace_vector, deque`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Equivalent to `return *(cv.begin() + n);`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `v.at(n)`, `Ref`, Containers, `basic_string, array, vector, inplace_vector, deque`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: `*(v.begin() + n)`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Exceptions: Throws `std::out_of_range` if `n >= v.size()` is `true`.

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: `cv.at(n)`, `CRef`, Containers, `basic_string, array, vector, inplace_vector, deque`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Return value: `*(cv.begin() + n)`

**Basic operations(required for all sequence containers in the standard library except std::array(since C++11))**: Exceptions: Throws `std::out_of_range` if `n >= cv.size()` is `true`.

**Notes**

1. ↑ For an expression whose effect is equivalent to some other operations, the conditions of the expressions inside those operations are inherited on top of the conditions listed in the table.
2. ↑ `std::array` supports assignment from a brace-enclosed initializer list, but not from an `std::initializer_list`.
3. ↑ All operations below except `prepend_range` and `append_range` (since C++23) take amortized constant time.
4. ↑ In C++98, `tmp` was declared to have type `C::iterator`.
5. ↑ In C++98, `tmp` was declared to have type `C::const_iterator`.
6. ↑ 6.0 6.1 Insertion order, relative to order of elements in `rg`, is non-reversing.

Additionally, for every sequence container:

- A constructor template that takes two input iterators and the member function template overloads of `insert`, `append`, `assign`, `replace` that take two input iterators do not participate in overload resolution if the corresponding template argument does not satisfy *LegacyInputIterator*.

(since C++17):

- A deduction guide that has either a *LegacyInputIterator* or an `Allocator` template parameter does not participate in overload resolution if the type that does not qualify as an input iterator or an allocator respectively is deduced for that parameter.

## Standard library

The following standard library string types and containers satisfy the *SequenceContainer* requirements:

- `basic_string`: stores and manipulates sequences of characters (class template)
- `array` (C++11): fixed-sized inplace contiguous array (class template)
- `vector`: dynamic contiguous array (class template)
- `inplace_vector` (C++26): dynamically-resizable, fixed capacity, inplace contiguous array (class template)
- `deque`: double-ended queue (class template)
- `forward_list` (C++11): singly-linked list (class template)
- `list`: doubly-linked list (class template)

### Usage notes

| Container | Pros | Cons |
| --- | --- | --- |
| `std::vector` | Fast access, contiguous storage | Mostly inefficient insertions/deletions |
| `std::inplace_vector` | Fast access, inplace contiguous storage | Fixed capacity and mostly inefficient insertions/deletions |
| `std::array` | Fast access, inplace contiguous storage | Fixed number of elements and no insertion/deletion |
| `std::deque` | Fast access, efficient insertion/deletion at the beginning/end | Inefficient insertion/deletion in the middle of the sequence |
| `std::list` `std::forward_list` | Efficient insertion/deletion in the middle of the sequence | Access is mostly linear-time |

## Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| LWG 139 | C++98 | the optional operations were not required to be implemented for the designated containers | required with amortized time |
| LWG 149 | C++98 | `v.insert(p, t)` returned `Iter` while `v.insert(p, n, t)` and `v.insert(p, n, t)` returned `void` | they all return `Iter` |
| LWG 151 | C++98 | `q1` was required to be dereferenceable[1] | it can be non-dereferenceable |
| LWG 355 | C++98 | calling `v.back()` or `v.pop_back()` would execute `--v.end()`, which is dangerous[2] | decrements a copy of `v.end()` instead |
| LWG 589 | C++98 | the elements that `i` and `j` refer to might not be convertible to `C::value_type` | they are implicitly convertible to `C::value_type` |
| LWG 2194 | C++11 | `std::queue`, `std::priority_queue` and `std::stack` were also *SequenceContainer*s[3] | they are not *SequenceContainer*s |
| LWG 2231 | C++11 | the complexity requirement of `v.clear()` was mistakenly omitted in C++11 | complexity reaffirmed as linear |
| LWG 3927 | C++98 | `operator[]` had no implicit requirement | added the implicit requirement |

1. ↑ It is a defect because it makes the behavior of `v.erase(v.begin(), v.end())` undefined is `v` is an empty container.
2. ↑ If the type of `v.end()` is a fundamental type, `--v.end()` is ill-formed. It is dangerous when the type of `v` is templated, in this case this bug can be difficult to be found.
3. ↑ They were not documented as *SequenceContainer*s in C++98.
