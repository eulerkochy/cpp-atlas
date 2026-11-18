# std::common_type<std::pair>

Source: https://en.cppreference.com/w/cpp/utility/pair/common_type

```cpp
// Defined in header <utility>

template< class T1, class T2, class U1, class U2 >
  requires requires { typename std::pair<std::common_type_t<T1, U1>,
                                         std::common_type_t<T2, U2>>; }
struct common_type<std::pair<T1, T2>, std::pair<U1, U2>>; // (since C++23)
```

The common type of two `pair`s is a `pair` of both common types of corresponding element types of both `pair`s.

The common type is defined only if both pairs of corresponding element types have common types.

## Member types

**Member type — Definition**

- `type`: `std::pair<std::common_type_t<T1, U1>, std::common_type_t<T2, U2>>`

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`common_type`](https://en.cppreference.com/w/cpp/types/common_type) (C++11): determines the common type of a group of types (class template)
- [`std::common_type<tuple-like>`](https://en.cppreference.com/w/cpp/utility/tuple/common_type) (C++23): determines the common type of a `tuple` and a `tuple-like` type (class template specialization)
