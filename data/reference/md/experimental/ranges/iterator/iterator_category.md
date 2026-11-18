# std::experimental::ranges::iterator_category

Source: https://en.cppreference.com/w/cpp/experimental/ranges/iterator/iterator_category

```cpp
// Defined in header <experimental/ranges/iterator>

template< class I >
struct iterator_category {}; // (1)

template< class T >
struct iterator_category<T*>; // (2)

template< class T >
struct iterator_category<const T> : iterator_category<T> {}; // (3)

template< class T >
    requires requires { typename T::iterator_category; }
struct iterator_category<T>; // (4)
```

Computes the iterator category of the class `I`, if any. Users may specialize `iterator_category` for a program-defined type.

1) Primary template is an empty struct.

2) Specialization for pointers. If `T` is an object type, provides a member type `type` equal to `ranges::random_access_iterator_tag`. Otherwise, there is no member `type`.

3) Specialization for const-qualified types.

4) Specialization for types that define a public and accessible member type `iterator_category`. If `T::iterator_category` is the same as or derived from one of iterator category tags in namespace `std`, it is mapped to the corresponding tag in the namespace `ranges` as described below. Otherwise, provides a member type `type` equal to `T::iterator_category`.

   - If `T::iterator_category` is the same as or derives from `std::random_access_iterator_tag`, provides a member type `type` equal to `ranges::random_access_iterator_tag`.
   - Otherwise, if `T::iterator_category` is the same as or derives from `std::bidirectional_iterator_tag`, provides a member type `type` equal to `ranges::bidirectional_iterator_tag`.
   - Otherwise, if `T::iterator_category` is the same as or derives from `std::forward_iterator_tag`, provides a member type `type` equal to `ranges::forward_iterator_tag`.
   - Otherwise, if `T::iterator_category` is the same as or derives from `std::input_iterator_tag`, provides a member type `type` equal to `ranges::input_iterator_tag`.
   - Otherwise, if `T::iterator_category` is the same as or derives from `std::output_iterator_tag`, there is no member `type`.

## Helper alias template

```cpp
template< class T >
using iterator_category_t = typename ranges::iterator_category<T>::type; // (ranges TS)
```

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`input_iterator_tag`](https://en.cppreference.com/w/cpp/iterator/iterator_tags), [`output_iterator_tag`](https://en.cppreference.com/w/cpp/iterator/iterator_tags), [`forward_iterator_tag`](https://en.cppreference.com/w/cpp/iterator/iterator_tags), [`bidirectional_iterator_tag`](https://en.cppreference.com/w/cpp/iterator/iterator_tags), [`random_access_iterator_tag`](https://en.cppreference.com/w/cpp/iterator/iterator_tags), [`contiguous_iterator_tag`](https://en.cppreference.com/w/cpp/iterator/iterator_tags) (C++20): empty class types used to indicate iterator categories (class)
- [`input_iterator_tag`](https://en.cppreference.com/w/cpp/experimental/ranges/iterator/iterator_tags), [`output_iterator_tag`](https://en.cppreference.com/w/cpp/experimental/ranges/iterator/iterator_tags), [`forward_iterator_tag`](https://en.cppreference.com/w/cpp/experimental/ranges/iterator/iterator_tags), [`bidirectional_iterator_tag`](https://en.cppreference.com/w/cpp/experimental/ranges/iterator/iterator_tags), [`random_access_iterator_tag`](https://en.cppreference.com/w/cpp/experimental/ranges/iterator/iterator_tags): empty class types used to indicate iterator categories (class)
- `iterator_traits`: compatibility traits class that collects an iterator’s associated types (alias template)
