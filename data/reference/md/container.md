# Containers library

Source: https://en.cppreference.com/w/cpp/container

The Containers library is a generic collection of class templates and algorithms that allow programmers to easily implement common data structures like queues, lists and stacks. There are two (until C++11) three (since C++11) classes of containers:

- sequence containers,
- associative containers,

(since C++11):

- unordered associative containers,

each of which is designed to support a different set of operations.

The container manages the storage space that is allocated for its elements and provides member functions to access them, either directly or through iterators (objects with properties similar to pointers).

Most containers have at least several member functions in common, and share functionalities. Which container is the best for the particular application depends not only on the offered functionality, but also on its efficiency for different workloads.

## Sequence containers

Sequence containers implement data structures which can be accessed sequentially.

- `array` (C++11): fixed-sized inplace contiguous array (class template)
- `vector`: dynamic contiguous array (class template)
- `inplace_vector` (C++26): dynamically-resizable, fixed capacity, inplace contiguous array (class template)
- `deque`: double-ended queue (class template)
- `forward_list` (C++11): singly-linked list (class template)
- `list`: doubly-linked list (class template)

## Associative containers

Associative containers implement sorted data structures that can be quickly searched (O(log n) complexity).

- `set`: collection of unique keys, sorted by keys (class template)
- `map`: collection of key-value pairs, sorted by keys, keys are unique (class template)
- `multiset`: collection of keys, sorted by keys (class template)
- `multimap`: collection of key-value pairs, sorted by keys (class template)

## Unordered associative containers (since C++11)

Unordered associative containers implement unsorted (hashed) data structures that can be quickly searched (O(1) average, O(n) worst-case complexity).

- `unordered_set` (C++11): collection of unique keys, hashed by keys (class template)
- `unordered_map` (C++11): collection of key-value pairs, hashed by keys, keys are unique (class template)
- `unordered_multiset` (C++11): collection of keys, hashed by keys (class template)
- `unordered_multimap` (C++11): collection of key-value pairs, hashed by keys (class template)

## Container adaptors

Container adaptors provide a different interface for sequential containers.

- `stack`: adapts a container to provide stack (LIFO data structure) (class template)
- `queue`: adapts a container to provide queue (FIFO data structure) (class template)
- `priority_queue`: adapts a container to provide priority queue (class template)
- `flat_set` (C++23): adapts a container to provide a collection of unique keys, sorted by keys (class template)
- `flat_map` (C++23): adapts two containers to provide a collection of key-value pairs, sorted by unique keys (class template)
- `flat_multiset` (C++23): adapts a container to provide a collection of keys, sorted by keys (class template)
- `flat_multimap` (C++23): adapts two containers to provide a collection of key-value pairs, sorted by keys (class template)

## Views (since C++20)

Views provide flexible facilities for interacting with one- or multi-dimensional views over a non-owning array of elements.

- `span` (C++20): a non-owning view over a contiguous sequence of objects (class template)
- `mdspan` (C++23): a multi-dimensional non-owning array view (class template)

## Iterator invalidation

Read-only methods never invalidate iterators or references. Methods which modify the contents of a container may invalidate iterators and/or references, as summarized in this table.

|   |   |   |   |   |   |   |
| --- | --- | --- | --- | --- | --- | --- |
| Category | Container | After **insertion**, are... |   | After **erasure**, are... |   | Conditionally |
| Category | Container | **iterators** valid? | **references** valid? | **iterators** valid? | **references** valid? | Conditionally |
| Sequence containers | `array` | N/A |   | N/A |   |   |
| Sequence containers | `vector` | No |   | N/A |   | Insertion changed capacity |
| Sequence containers | `vector` | Yes |   | Yes |   | Before modified element(s) (for insertion only if capacity didn't change) |
| Sequence containers | `vector` | No |   | No |   | At or after modified element(s) |
| Sequence containers | `deque` | No | Yes | Yes, except erased element(s) |   | Modified first or last element |
| Sequence containers | `deque` | No | No | No |   | Modified middle only |
| Sequence containers | `list` | Yes |   | Yes, except erased element(s) |   |   |
| Sequence containers | `forward_list` | Yes |   | Yes, except erased element(s) |   |   |
| Associative containers | `set` `multiset` `map` `multimap` | Yes |   | Yes, except erased element(s) |   |   |
| Unordered associative containers | `unordered_set` `unordered_multiset` `unordered_map` `unordered_multimap` | No | Yes | N/A |   | Insertion caused rehash |
| Unordered associative containers | `unordered_set` `unordered_multiset` `unordered_map` `unordered_multimap` | Yes | Yes | Yes, except erased element(s) |   | No rehash |

> Note: This section is incomplete Reason: add iterator invalidation for C++23 "flat" adaptors (`std::flat_set` etc)

> Note: This section is incomplete Reason: add iterator invalidation for C++26 `std::inplace_vector`

Here, **insertion** refers to any method which adds one or more elements to the container and **erasure** refers to any method which removes one or more elements from the container.

- Examples of insertion methods are `std::set::insert`, `std::map::emplace`, `std::vector::push_back`, and `std::deque::push_front`.

  - Note that `std::unordered_map::operator[]` also counts, as it may insert an element into the map. (since C++11)

- Examples of erasure methods are `std::set::erase`, `std::vector::pop_back`, `std::deque::pop_front`, and `std::map::clear`.
  - `clear` invalidates all iterators and references. Because it erases all elements, this technically complies with the rules above.

Unless otherwise specified (either explicitly or by defining a function in terms of other functions), passing a container as an argument to a library function never invalidate iterators to, or change the values of, objects within that container.

The past-the-end iterator deserves particular mention. In general this iterator is invalidated as though it were a normal iterator to a non-erased element. So `std::set::end` is never invalidated, `std::unordered_set::end` is invalidated only on rehash (since C++11), `std::vector::end` is always invalidated (since it is always after the modified elements), and so on.

There is one exception: an erasure which deletes the last element of a `std::deque` *does* invalidate the past-the-end iterator, even though it is not an erased element of the container (or an element at all). Combined with the general rules for `std::deque` iterators, the net result is that the only modifying operation which does *not* invalidate `std::deque::end` is an erasure which deletes the first element, but not the last.

(since C++11):

## Thread safety

1. All container functions can be called concurrently by different threads on different containers. More generally, the C++ standard library functions do not read objects accessible by other threads unless those objects are directly or indirectly accessible via the function arguments, including the this pointer.
2. All `const` member functions can be called concurrently by different threads on the same container. In addition, the member functions `begin()`, `end()`, `rbegin()`, `rend()`, `front()`, `back()`, `data()`, `find()`, `lower_bound()`, `upper_bound()`, `equal_range()`, `at()`, and, except in associative containers, `operator[]`, behave as `const` for the purposes of thread safety (that is, they can also be called concurrently by different threads on the same container). More generally, the C++ standard library functions do not modify objects unless those objects are accessible, directly or indirectly, via the function's non-const arguments, including the this pointer.
3. Different elements in the same container can be modified concurrently by different threads, except for the elements of `std::vector<bool>` (for example, a vector of `std::future` objects can be receiving values from multiple threads).
4. Iterator operations (e.g. incrementing an iterator) read, but do not modify the underlying container, and may be executed concurrently with operations on other iterators on the same container, with the const member functions, or reads from the elements. Container operations that invalidate any iterators modify the container and cannot be executed concurrently with any operations on existing iterators even if those iterators are not invalidated.
5. Elements of the same container can be modified concurrently with those member functions that are not specified to access these elements. More generally, the C++ standard library functions do not read objects indirectly accessible through their arguments (including other elements of a container) except when required by its specification.
6. In any case, container operations (as well as algorithms, or any other C++ standard library functions) may be parallelized internally as long as this does not change the user-visible results (e.g. `std::transform` may be parallelized, but not `std::for_each` which is specified to visit each element of a sequence in order).

## Function table

Note: `std::basic_string` is not treated as a container by the standard but behaves much like one due to its similarity. It is listed as 'Pseudo container' here for convenience.

- functions present in C++03

- functions present since C++11

- functions present since C++17

- functions present since C++20

- functions present since C++23

> Note: This section is incomplete Reason: Add C++26 "color" and fill member/non-member function table for `std::inplace_vector`

### Member function table

Pseudo container: Sequence containers: Associative containers: Unordered associative containers: Container adaptors

**Container basic_string array vector deque forward_list list set multiset map multimap unordered_set unordered_multiset unordered_map unordered_multimap stack queue priority_queue flat_set flat_multiset flat_map flat_multimap Container**

**Header**: `(constructor)`

**<string>**: `basic_string`

**<array>**: (implicit)

**<vector>**: `vector`

**<deque>**: `deque`

**<forward_list>**: `forward_list`

**<list>**: `list`

**<set>**: `set`, `multiset`

**<map>**: `map`, `multimap`

**<unordered_set>**: `unordered_set`, `unordered_multiset`

**<unordered_map>**: `unordered_map`, `unordered_multimap`

**<stack>**: `stack`

**<queue>**: `queue`, `priority_queue`

**<flat_set>**: `flat_set`, `flat_multiset`

**<flat_map>**: `flat_map`, `flat_multimap`

**Header**: `(constructor)`

**Header**: `(destructor)`

**<string>**: `~basic_string`

**<array>**: (implicit)

**<vector>**: `~vector`

**<deque>**: `~deque`

**<forward_list>**: `~forward_list`

**<list>**: `~list`

**<set>**: `~set`, `~multiset`

**<map>**: `~map`, `~multimap`

**<unordered_set>**: `~unordered_set`, `~unordered_multiset`

**<unordered_map>**: `~unordered_map`, `~unordered_multimap`

**<stack>**: `~stack`

**<queue>**: `~queue`, `~priority_queue`

**<flat_set>**: `~flat_set`, `~flat_multiset`

**<flat_map>**: `~flat_map`, `~flat_multimap`

**Header**: `(destructor)`

**Header**: `operator=`

**<string>**: `operator=`

**<array>**: (implicit)

**<vector>**: `operator=`

**<deque>**: `operator=`

**<forward_list>**: `operator=`

**<list>**: `operator=`

**<set>**: `operator=`, `operator=`

**<map>**: `operator=`, `operator=`

**<unordered_set>**: `operator=`, `operator=`

**<unordered_map>**: `operator=`, `operator=`

**<stack>**: `operator=`

**<queue>**: `operator=`, `operator=`

**<flat_set>**: `operator=`, `operator=`

**<flat_map>**: `operator=`, `operator=`

**Header**: `operator=`

**Header**: `assign`

**<string>**: `assign`

**<vector>**: `assign`

**<deque>**: `assign`

**<forward_list>**: `assign`

**<list>**: `assign`

**Header**: `assign`

**Header**: `assign_range`

**<string>**: `assign_range`

**<vector>**: `assign_range`

**<deque>**: `assign_range`

**<forward_list>**: `assign_range`

**<list>**: `assign_range`

**Header**: `assign_range`

**Header**:

Iterators

`begin`

`cbegin`

**<string>**:

`begin`
`cbegin`

**<array>**:

`begin`
`cbegin`

**<vector>**:

`begin`
`cbegin`

**<deque>**:

`begin`
`cbegin`

**<forward_list>**:

`begin`
`cbegin`

**<list>**:

`begin`
`cbegin`

**<set>**:

`begin`
`cbegin`

`begin`
`cbegin`

**<map>**:

`begin`
`cbegin`

`begin`
`cbegin`

**<unordered_set>**:

`begin`
`cbegin`

`begin`
`cbegin`

**<unordered_map>**:

`begin`
`cbegin`

`begin`
`cbegin`

**<flat_set>**:

`begin`
`cbegin`

`begin`
`cbegin`

**<flat_map>**:

`begin`
`cbegin`

`begin`
`cbegin`

**Header**:

`begin`

`cbegin`

Iterators

**Header**:

`end`

`cend`

**<string>**:

`end`
`cend`

**<array>**:

`end`
`cend`

**<vector>**:

`end`
`cend`

**<deque>**:

`end`
`cend`

**<forward_list>**:

`end`
`cend`

**<list>**:

`end`
`cend`

**<set>**:

`end`
`cend`

`end`
`cend`

**<map>**:

`end`
`cend`

`end`
`cend`

**<unordered_set>**:

`end`
`cend`

`end`
`cend`

**<unordered_map>**:

`end`
`cend`

`end`
`cend`

**<flat_set>**:

`end`
`cend`

`end`
`cend`

**<flat_map>**:

`end`
`cend`

`end`
`cend`

**Header**:

`end`

`cend`

**Header**:

`rbegin`

`crbegin`

**<string>**:

`rbegin`
`crbegin`

**<array>**:

`rbegin`
`crbegin`

**<vector>**:

`rbegin`
`crbegin`

**<deque>**:

`rbegin`
`crbegin`

**<list>**:

`rbegin`
`crbegin`

**<set>**:

`rbegin`
`crbegin`

`rbegin`
`crbegin`

**<map>**:

`rbegin`
`crbegin`

`rbegin`
`crbegin`

**<flat_set>**:

`rbegin`
`crbegin`

`rbegin`
`crbegin`

**<flat_map>**:

`rbegin`
`crbegin`

`rbegin`
`crbegin`

**Header**:

`rbegin`

`crbegin`

**Header**:

`rend`

`crend`

**<string>**:

`rend`
`crend`

**<array>**:

`rend`
`crend`

**<vector>**:

`rend`
`crend`

**<deque>**:

`rend`
`crend`

**<list>**:

`rend`
`crend`

**<set>**:

`rend`
`crend`

`rend`
`crend`

**<map>**:

`rend`
`crend`

`rend`
`crend`

**<flat_set>**:

`rend`
`crend`

`rend`
`crend`

**<flat_map>**:

`rend`
`crend`

`rend`
`crend`

**Header**:

`rend`

`crend`

**Header**:

Element
access

`at`

**<string>**: `at`

**<array>**: `at`

**<vector>**: `at`

**<deque>**: `at`

**<map>**: `at`

**<unordered_map>**: `at`

**<flat_map>**: `at`

**Header**:

`at`

Element
access

**Header**: `operator[]`

**<string>**: `operator[]`

**<array>**: `operator[]`

**<vector>**: `operator[]`

**<deque>**: `operator[]`

**<map>**: `operator[]`

**<unordered_map>**: `operator[]`

**<flat_map>**: `operator[]`

**Header**: `operator[]`

**Header**: `data`

**<string>**: `data`

**<array>**: `data`

**<vector>**: `data`

**Header**: `data`

**Header**: `front`

**<string>**: `front`

**<array>**: `front`

**<vector>**: `front`

**<deque>**: `front`

**<forward_list>**: `front`

**<list>**: `front`

**<queue>**: `front`, `top`

**Header**: `front`

**Header**: `back`

**<string>**: `back`

**<array>**: `back`

**<vector>**: `back`

**<deque>**: `back`

**<list>**: `back`

**<stack>**: `top`

**<queue>**: `back`

**Header**: `back`

**Header**: Capacity: `empty`

**<string>**: `empty`

**<array>**: `empty`

**<vector>**: `empty`

**<deque>**: `empty`

**<forward_list>**: `empty`

**<list>**: `empty`

**<set>**: `empty`, `empty`

**<map>**: `empty`, `empty`

**<unordered_set>**: `empty`, `empty`

**<unordered_map>**: `empty`, `empty`

**<stack>**: `empty`

**<queue>**: `empty`, `empty`

**<flat_set>**: `empty`, `empty`

**<flat_map>**: `empty`, `empty`

**Header**: `empty`, Capacity

**Header**: `size`

**<string>**: `size`

**<array>**: `size`

**<vector>**: `size`

**<deque>**: `size`

**<list>**: `size`

**<set>**: `size`, `size`

**<map>**: `size`, `size`

**<unordered_set>**: `size`, `size`

**<unordered_map>**: `size`, `size`

**<stack>**: `size`

**<queue>**: `size`, `size`

**<flat_set>**: `size`, `size`

**<flat_map>**: `size`, `size`

**Header**: `size`

**Header**: `max_size`

**<string>**: `max_size`

**<array>**: `max_size`

**<vector>**: `max_size`

**<deque>**: `max_size`

**<forward_list>**: `max_size`

**<list>**: `max_size`

**<set>**: `max_size`, `max_size`

**<map>**: `max_size`, `max_size`

**<unordered_set>**: `max_size`, `max_size`

**<unordered_map>**: `max_size`, `max_size`

**<flat_set>**: `max_size`, `max_size`

**<flat_map>**: `max_size`, `max_size`

**Header**: `max_size`

**Header**: `resize`

**<string>**: `resize`

**<vector>**: `resize`

**<deque>**: `resize`

**<forward_list>**: `resize`

**<list>**: `resize`

**Header**: `resize`

**Header**: `capacity`

**<string>**: `capacity`

**<vector>**: `capacity`

**Header**: `capacity`

**Header**: `reserve`

**<string>**: `reserve`

**<vector>**: `reserve`

**<unordered_set>**: `reserve`, `reserve`

**<unordered_map>**: `reserve`, `reserve`

**Header**: `reserve`

**Header**: `shrink_to_fit`

**<string>**: `shrink_to_fit`

**<vector>**: `shrink_to_fit`

**<deque>**: `shrink_to_fit`

**Header**: `shrink_to_fit`

**Header**: Modifiers: `clear`

**<string>**: `clear`

**<vector>**: `clear`

**<deque>**: `clear`

**<forward_list>**: `clear`

**<list>**: `clear`

**<set>**: `clear`, `clear`

**<map>**: `clear`, `clear`

**<unordered_set>**: `clear`, `clear`

**<unordered_map>**: `clear`, `clear`

**<flat_set>**: `clear`, `clear`

**<flat_map>**: `clear`, `clear`

**Header**: `clear`, Modifiers

**Header**: `insert`

**<string>**: `insert`

**<vector>**: `insert`

**<deque>**: `insert`

**<forward_list>**: `insert_after`

**<list>**: `insert`

**<set>**: `insert`, `insert`

**<map>**: `insert`, `insert`

**<unordered_set>**: `insert`, `insert`

**<unordered_map>**: `insert`, `insert`

**<flat_set>**: `insert`, `insert`

**<flat_map>**: `insert`, `insert`

**Header**: `insert`

**Header**: `insert_range`

**<string>**: `insert_range`

**<vector>**: `insert_range`

**<deque>**: `insert_range`

**<forward_list>**: `insert_range_after`

**<list>**: `insert_range`

**<set>**: `insert_range`, `insert_range`

**<map>**: `insert_range`, `insert_range`

**<unordered_set>**: `insert_range`, `insert_range`

**<unordered_map>**: `insert_range`, `insert_range`

**<flat_set>**: `insert_range`, `insert_range`

**<flat_map>**: `insert_range`, `insert_range`

**Header**: `insert_range`

**Header**: `insert_or_assign`

**<map>**: `insert_or_assign`

**<unordered_map>**: `insert_or_assign`

**<flat_map>**: `insert_or_assign`

**Header**: `insert_or_assign`

**Header**: `emplace`

**<vector>**: `emplace`

**<deque>**: `emplace`

**<forward_list>**: `emplace_after`

**<list>**: `emplace`

**<set>**: `emplace`, `emplace`

**<map>**: `emplace`, `emplace`

**<unordered_set>**: `emplace`, `emplace`

**<unordered_map>**: `emplace`, `emplace`

**<flat_set>**: `emplace`, `emplace`

**<flat_map>**: `emplace`, `emplace`

**Header**: `emplace`

**Header**: `emplace_hint`

**<set>**: `emplace_hint`, `emplace_hint`

**<map>**: `emplace_hint`, `emplace_hint`

**<unordered_set>**: `emplace_hint`, `emplace_hint`

**<unordered_map>**: `emplace_hint`, `emplace_hint`

**<flat_set>**: `emplace_hint`, `emplace_hint`

**<flat_map>**: `emplace_hint`, `emplace_hint`

**Header**: `emplace_hint`

**Header**: `try_emplace`

**<map>**: `try_emplace`

**<unordered_map>**: `try_emplace`

**<flat_map>**: `try_emplace`

**Header**: `try_emplace`

**Header**: `erase`

**<string>**: `erase`

**<vector>**: `erase`

**<deque>**: `erase`

**<forward_list>**: `erase_after`

**<list>**: `erase`

**<set>**: `erase`, `erase`

**<map>**: `erase`, `erase`

**<unordered_set>**: `erase`, `erase`

**<unordered_map>**: `erase`, `erase`

**<flat_set>**: `erase`, `erase`

**<flat_map>**: `erase`, `erase`

**Header**: `erase`

**Header**: `push_front`

**<deque>**: `push_front`

**<forward_list>**: `push_front`

**<list>**: `push_front`

**Header**: `push_front`

**Header**: `prepend_range`

**<deque>**: `prepend_range`

**<forward_list>**: `prepend_range`

**<list>**: `prepend_range`

**Header**: `prepend_range`

**Header**: `emplace_front`

**<deque>**: `emplace_front`

**<forward_list>**: `emplace_front`

**<list>**: `emplace_front`

**Header**: `emplace_front`

**Header**: `pop_front`

**<deque>**: `pop_front`

**<forward_list>**: `pop_front`

**<list>**: `pop_front`

**<queue>**: `pop`, `pop`

**Header**: `pop_front`

**Header**: `push_back`

**<string>**: `push_back`

**<vector>**: `push_back`

**<deque>**: `push_back`

**<list>**: `push_back`

**<stack>**: `push`

**<queue>**: `push`, `push`

**Header**: `push_back`

**Header**: `append_range`

**<string>**: `append_range`

**<vector>**: `append_range`

**<deque>**: `append_range`

**<list>**: `append_range`

**<stack>**: `push_range`

**<queue>**: `push_range`, `push_range`

**Header**: `append_range`

**Header**: `emplace_back`

**<vector>**: `emplace_back`

**<deque>**: `emplace_back`

**<list>**: `emplace_back`

**<stack>**: `emplace`

**<queue>**: `emplace`, `emplace`

**Header**: `emplace_back`

**Header**: `pop_back`

**<string>**: `pop_back`

**<vector>**: `pop_back`

**<deque>**: `pop_back`

**<list>**: `pop_back`

**<stack>**: `pop`

**Header**: `pop_back`

**Header**: `swap`

**<string>**: `swap`

**<array>**: `swap`

**<vector>**: `swap`

**<deque>**: `swap`

**<forward_list>**: `swap`

**<list>**: `swap`

**<set>**: `swap`, `swap`

**<map>**: `swap`, `swap`

**<unordered_set>**: `swap`, `swap`

**<unordered_map>**: `swap`, `swap`

**<stack>**: `swap`

**<queue>**: `swap`, `swap`

**<flat_set>**: `swap`, `swap`

**<flat_map>**: `swap`, `swap`

**Header**: `swap`

**Header**: `merge`

**<forward_list>**: `merge`

**<list>**: `merge`

**<set>**: `merge`, `merge`

**<map>**: `merge`, `merge`

**<unordered_set>**: `merge`, `merge`

**<unordered_map>**: `merge`, `merge`

**Header**: `merge`

**Header**: `extract [1]`

**<set>**: `extract`, `extract`

**<map>**: `extract`, `extract`

**<unordered_set>**: `extract`, `extract`

**<unordered_map>**: `extract`, `extract`

**Header**: `extract`

**Header**: List operations: `splice`

**<forward_list>**: `splice_after`

**<list>**: `splice`

**Header**: `splice`, List operations

**Header**: `remove`

**<forward_list>**: `remove`

**<list>**: `remove`

**Header**: `remove`

**Header**: `remove_if`

**<forward_list>**: `remove_if`

**<list>**: `remove_if`

**Header**: `remove_if`

**Header**: `reverse`

**<forward_list>**: `reverse`

**<list>**: `reverse`

**Header**: `reverse`

**Header**: `unique`

**<forward_list>**: `unique`

**<list>**: `unique`

**Header**: `unique`

**Header**: `sort`

**<forward_list>**: `sort`

**<list>**: `sort`

**Header**: `sort`

**Header**:

Bucket and Hash

`begin(size_type)`

`cbegin(size_type)`

**<unordered_set>**:

`begin(size_type)`
`cbegin(size_type)`

`begin(size_type)`
`cbegin(size_type)`

**<unordered_map>**:

`begin(size_type)`
`cbegin(size_type)`

`begin(size_type)`
`cbegin(size_type)`

**Header**:

`begin(size_type)`

`cbegin(size_type)`

Bucket and Hash

**Header**:

`end(size_type)`

`cend(size_type)`

**<unordered_set>**:

`end(size_type)`
`cend(size_type)`

`end(size_type)`
`cend(size_type)`

**<unordered_map>**:

`end(size_type)`
`cend(size_type)`

`end(size_type)`
`cend(size_type)`

**Header**:

`end(size_type)`

`cend(size_type)`

**Header**: `bucket_count`

**<unordered_set>**: `bucket_count`, `bucket_count`

**<unordered_map>**: `bucket_count`, `bucket_count`

**Header**: `bucket_count`

**Header**: `max_bucket_count`

**<unordered_set>**: `max_bucket_count`, `max_bucket_count`

**<unordered_map>**: `max_bucket_count`, `max_bucket_count`

**Header**: `max_bucket_count`

**Header**: `bucket_size`

**<unordered_set>**: `bucket_size`, `bucket_size`

**<unordered_map>**: `bucket_size`, `bucket_size`

**Header**: `bucket_size`

**Header**: `bucket`

**<unordered_set>**: `bucket`, `bucket`

**<unordered_map>**: `bucket`, `bucket`

**Header**: `bucket`

**Header**: `load_factor`

**<unordered_set>**: `load_factor`, `load_factor`

**<unordered_map>**: `load_factor`, `load_factor`

**Header**: `load_factor`

**Header**: `max_load_factor`

**<unordered_set>**: `max_load_factor`, `max_load_factor`

**<unordered_map>**: `max_load_factor`, `max_load_factor`

**Header**: `max_load_factor`

**Header**: `rehash`

**<unordered_set>**: `rehash`, `rehash`

**<unordered_map>**: `rehash`, `rehash`

**Header**: `rehash`

**Header**: Lookup: `count`

**<set>**: `count`, `count`

**<map>**: `count`, `count`

**<unordered_set>**: `count`, `count`

**<unordered_map>**: `count`, `count`

**<flat_set>**: `count`, `count`

**<flat_map>**: `count`, `count`

**Header**: `count`, Lookup

**Header**: `find`

**<string>**: `find`

**<set>**: `find`, `find`

**<map>**: `find`, `find`

**<unordered_set>**: `find`, `find`

**<unordered_map>**: `find`, `find`

**<flat_set>**: `find`, `find`

**<flat_map>**: `find`, `find`

**Header**: `find`

**Header**: `contains`

**<string>**: `contains`

**<set>**: `contains`, `contains`

**<map>**: `contains`, `contains`

**<unordered_set>**: `contains`, `contains`

**<unordered_map>**: `contains`, `contains`

**<flat_set>**: `contains`, `contains`

**<flat_map>**: `contains`, `contains`

**Header**: `contains`

**Header**: `lower_bound`

**<set>**: `lower_bound`, `lower_bound`

**<map>**: `lower_bound`, `lower_bound`

**<flat_set>**: `lower_bound`, `lower_bound`

**<flat_map>**: `lower_bound`, `lower_bound`

**Header**: `lower_bound`

**Header**: `upper_bound`

**<set>**: `upper_bound`, `upper_bound`

**<map>**: `upper_bound`, `upper_bound`

**<flat_set>**: `upper_bound`, `upper_bound`

**<flat_map>**: `upper_bound`, `upper_bound`

**Header**: `upper_bound`

**Header**: `equal_range`

**<set>**: `equal_range`, `equal_range`

**<map>**: `equal_range`, `equal_range`

**<unordered_set>**: `equal_range`, `equal_range`

**<unordered_map>**: `equal_range`, `equal_range`

**<flat_set>**: `equal_range`, `equal_range`

**<flat_map>**: `equal_range`, `equal_range`

**Header**: `equal_range`

**Header**: Observers: `key_comp`

**<set>**: `key_comp`, `key_comp`

**<map>**: `key_comp`, `key_comp`

**<flat_set>**: `key_comp`, `key_comp`

**<flat_map>**: `key_comp`, `key_comp`

**Header**: `key_comp`, Observers

**Header**: `value_comp`

**<set>**: `value_comp`, `value_comp`

**<map>**: `value_comp`, `value_comp`

**<flat_set>**: `value_comp`, `value_comp`

**<flat_map>**: `value_comp`, `value_comp`

**Header**: `value_comp`

**Header**: `hash_function`

**<unordered_set>**: `hash_function`, `hash_function`

**<unordered_map>**: `hash_function`, `hash_function`

**Header**: `hash_function`

**Header**: `key_eq`

**<unordered_set>**: `key_eq`, `key_eq`

**<unordered_map>**: `key_eq`, `key_eq`

**Header**: `key_eq`

**Header**: Allocator: `get_allocator`

**<string>**: `get_allocator`

**<vector>**: `get_allocator`

**<deque>**: `get_allocator`

**<forward_list>**: `get_allocator`

**<list>**: `get_allocator`

**<set>**: `get_allocator`, `get_allocator`

**<map>**: `get_allocator`, `get_allocator`

**<unordered_set>**: `get_allocator`, `get_allocator`

**<unordered_map>**: `get_allocator`, `get_allocator`

**Header**: `get_allocator`, Allocator

**Header**: Adaptors: `extract [2]`

**<flat_set>**: `extract`, `extract`

**<flat_map>**: `extract`, `extract`

**Header**: `extract`, Adaptors

**Header**: `replace`

**<flat_set>**: `replace`, `replace`

**<flat_map>**: `replace`, `replace`

**Header**: `replace`

**Container basic_string array vector deque forward_list list set multiset map multimap unordered_set unordered_multiset unordered_map unordered_multimap stack queue priority_queue flat_set flat_multiset flat_map flat_multimap Container**

**Header <string> <array> <vector> <deque> <forward_list> <list> <set> <map> <unordered_set> <unordered_map> <stack> <queue> <flat_set> <flat_map> Header**

**<string>**: Pseudo container

**<array>**: Sequence containers

**<set>**: Associative containers

**<unordered_set>**: Unordered associative containers

**<stack>**: Container adaptors

- Note: functions in two different `extract` lines have different meanings and syntax:

1. ↑ e.g., `node_type extract(const_iterator)` or `node_type extract(Key&)`
2. ↑ e.g., `container_type extract() &&`

### Non-member function table

Pseudo container: Sequence containers: Associative containers: Unordered associative containers: Container adaptors

**Container basic_string array vector deque forward_list list set multiset map multimap unordered_set unordered_multiset unordered_map unordered_multimap stack queue priority_queue flat_set flat_multiset flat_map flat_multimap Container**

**Header**: Non-member function: `operator==`

**<string>**: `operator==`

**<array>**: `operator==`

**<vector>**: `operator==`

**<deque>**: `operator==`

**<forward_list>**: `operator==`

**<list>**: `operator==`

**<set>**: `operator==`, `operator==`

**<map>**: `operator==`, `operator==`

**<unordered_set>**: `operator==`, `operator==`

**<unordered_map>**: `operator==`, `operator==`

**<stack>**: `operator==`

**<queue>**: `operator==`

**<flat_set>**: `operator==`, `operator==`

**<flat_map>**: `operator==`, `operator==`

**Header**: `operator==`, Non-member function

**Header**: `operator!= (removed in C++20)`

**<string>**: `operator!=`

**<array>**: `operator!=`

**<vector>**: `operator!=`

**<deque>**: `operator!=`

**<forward_list>**: `operator!=`

**<list>**: `operator!=`

**<set>**: `operator!=`, `operator!=`

**<map>**: `operator!=`, `operator!=`

**<unordered_set>**: `operator!=`, `operator!=`

**<unordered_map>**: `operator!=`, `operator!=`

**<stack>**: `operator!=`

**<queue>**: `operator!=`

**Header**: `operator!= (removed in C++20)`

**Header**: `operator< (removed in C++20)`

**<string>**: `operator<`

**<array>**: `operator<`

**<vector>**: `operator<`

**<deque>**: `operator<`

**<forward_list>**: `operator<`

**<list>**: `operator<`

**<set>**: `operator<`, `operator<`

**<map>**: `operator<`, `operator<`

**<stack>**: `operator<`

**<queue>**: `operator<`

**Header**: `operator< (removed in C++20)`

**Header**: `operator<= (removed in C++20)`

**<string>**: `operator<=`

**<array>**: `operator<=`

**<vector>**: `operator<=`

**<deque>**: `operator<=`

**<forward_list>**: `operator<=`

**<list>**: `operator<=`

**<set>**: `operator<=`, `operator<=`

**<map>**: `operator<=`, `operator<=`

**<stack>**: `operator<=`

**<queue>**: `operator<=`

**Header**: `operator<= (removed in C++20)`

**Header**: `operator> (removed in C++20)`

**<string>**: `operator>`

**<array>**: `operator>`

**<vector>**: `operator>`

**<deque>**: `operator>`

**<forward_list>**: `operator>`

**<list>**: `operator>`

**<set>**: `operator>`, `operator>`

**<map>**: `operator>`, `operator>`

**<stack>**: `operator>`

**<queue>**: `operator>`

**Header**: `operator> (removed in C++20)`

**Header**: `operator>= (removed in C++20)`

**<string>**: `operator>=`

**<array>**: `operator>=`

**<vector>**: `operator>=`

**<deque>**: `operator>=`

**<forward_list>**: `operator>=`

**<list>**: `operator>=`

**<set>**: `operator>=`, `operator>=`

**<map>**: `operator>=`, `operator>=`

**<stack>**: `operator>=`

**<queue>**: `operator>=`

**Header**: `operator>= (removed in C++20)`

**Header**: `operator<=>`

**<string>**: `operator<=>`

**<array>**: `operator<=>`

**<vector>**: `operator<=>`

**<deque>**: `operator<=>`

**<forward_list>**: `operator<=>`

**<list>**: `operator<=>`

**<set>**: `operator<=>`, `operator<=>`

**<map>**: `operator<=>`, `operator<=>`

**<stack>**: `operator<=>`

**<queue>**: `operator<=>`

**<flat_set>**: `operator<=>`, `operator<=>`

**<flat_map>**: `operator<=>`, `operator<=>`

**Header**: `operator<=>`

**Header**: `swap`

**<string>**: `swap`

**<array>**: `swap`

**<vector>**: `swap`

**<deque>**: `swap`

**<forward_list>**: `swap`

**<list>**: `swap`

**<set>**: `swap`, `swap`

**<map>**: `swap`, `swap`

**<unordered_set>**: `swap`, `swap`

**<unordered_map>**: `swap`, `swap`

**<stack>**: `swap`

**<queue>**: `swap`, `swap`

**<flat_set>**: `swap`, `swap`

**<flat_map>**: `swap`, `swap`

**Header**: `swap`

**Header**: `erase`

**<string>**: `erase`

**<vector>**: `erase`

**<deque>**: `erase`

**<forward_list>**: `erase`

**<list>**: `erase`

**Header**: `erase`

**Header**: `erase_if`

**<string>**: `erase_if`

**<vector>**: `erase_if`

**<deque>**: `erase_if`

**<forward_list>**: `erase_if`

**<list>**: `erase_if`

**<set>**: `erase_if`, `erase_if`

**<map>**: `erase_if`, `erase_if`

**<unordered_set>**: `erase_if`, `erase_if`

**<unordered_map>**: `erase_if`, `erase_if`

**<flat_set>**: `erase_if`, `erase_if`

**<flat_map>**: `erase_if`, `erase_if`

**Header**: `erase_if`

**Container basic_string array vector deque forward_list list set multiset map multimap unordered_set unordered_multiset unordered_map unordered_multimap stack queue priority_queue flat_set flat_multiset flat_map flat_multimap Container**

**Header <string> <array> <vector> <deque> <forward_list> <list> <set> <map> <unordered_set> <unordered_map> <stack> <queue> <flat_set> <flat_map> Header**

**<string>**: Pseudo container

**<array>**: Sequence containers

**<set>**: Associative containers

**<unordered_set>**: Unordered associative containers

**<stack>**: Container adaptors

The `<`, `<=`, `>`, `>=`, and `!=` operators are synthesized from `operator<=>` and `operator==` respectively. (since C++20)

## Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| LWG 51 | C++98 | container iterators might be invalidated by arbitrary library operation | they are only invalidated when specified |

## See also

C++ named requirements:

- [*Container*](https://en.cppreference.com/w/cpp/named_req/Container)
- [*SequenceContainer*](https://en.cppreference.com/w/cpp/named_req/SequenceContainer)
- [*ContiguousContainer*](https://en.cppreference.com/w/cpp/named_req/ContiguousContainer)
- [*ReversibleContainer*](https://en.cppreference.com/w/cpp/named_req/ReversibleContainer)
- [*AssociativeContainer*](https://en.cppreference.com/w/cpp/named_req/AssociativeContainer)
- [*AllocatorAwareContainer*](https://en.cppreference.com/w/cpp/named_req/AllocatorAwareContainer)
- [*UnorderedAssociativeContainer*](https://en.cppreference.com/w/cpp/named_req/UnorderedAssociativeContainer)

- [`valarray`](https://en.cppreference.com/w/cpp/numeric/valarray): numeric arrays, array masks and array slices (class template)
- [`basic_string`](https://en.cppreference.com/w/cpp/string/basic_string): stores and manipulates sequences of characters (class template)
- [`basic_string_view`](https://en.cppreference.com/w/cpp/string/basic_string_view) (C++17): read-only string view (class template)
