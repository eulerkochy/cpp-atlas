# std::tuple_size<std::array>

Source: https://en.cppreference.com/w/cpp/container/array/tuple_size

```cpp
// Defined in header <array>

template< class T, std::size_t N >
struct tuple_size< std::array<T, N> > :
    std::integral_constant<std::size_t, N>
{ }; // (since C++11)
```

Provides access to the number of elements in an `std::array` as a compile-time constant expression.

### Helper variable template

```cpp
template< class T >
constexpr std::size_t tuple_size_v = tuple_size<T>::value; // (since C++17)
```

## Inherited from std::integral_constant

### Member constants

- `value` [static]: `N`, the number of elements in the array (public static member constant)

### Member functions

- `operator std::size_t`: converts the object to `std::size_t`, returns `value` (public member function)
- `operator()` (C++14): returns `value` (public member function)

### Member types

**Type — Definition**

- `value_type`: `std::size_t`
- `type`: `std::integral_constant<std::size_t, value>`

### Example

```cpp
#include <array>

int main()
{
    auto arr = std::to_array("ABBA");
    static_assert(std::tuple_size<decltype(arr)>{} == 5);
}
```

### See also

- [Structured binding (C++17)](https://en.cppreference.com/w/cpp/language/structured_binding): binds the specified names to sub-objects or tuple elements of the initializer
- [`tuple_size`](https://en.cppreference.com/w/cpp/utility/tuple_size) (C++11): obtains the number of elements of a tuple-like type (class template)
- [`std::tuple_size<std::tuple>`](https://en.cppreference.com/w/cpp/utility/tuple/tuple_size) (C++11): obtains the size of a `tuple` (class template specialization)
- [`std::tuple_size<std::pair>`](https://en.cppreference.com/w/cpp/utility/pair/tuple_size) (C++11): obtains the size of a `pair` (class template specialization)
- [`std::tuple_size<std::ranges::subrange>`](https://en.cppreference.com/w/cpp/ranges/subrange/tuple_size) (C++20): obtains the size of a `std::ranges::subrange` (class template specialization)
