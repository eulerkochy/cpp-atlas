# std::not1

Source: https://en.cppreference.com/w/cpp/utility/functional/not1

```cpp
// Defined in header <functional>

template< class Predicate >
std::unary_negate<Predicate> not1( const Predicate& pred ); // (until C++14)

template< class Predicate >
constexpr std::unary_negate<Predicate> not1( const Predicate& pred ); // (since C++14) (deprecated in C++17) (removed in C++20)
```

`std::not1` is a helper function to create a function object that returns the complement of the unary predicate function passed. The function object created is of type `std::unary_negate<Predicate>`.

The unary predicate type must define a member type, `argument_type`, that is convertible to the predicate's parameter type. The unary function objects obtained from `std::ref`, `std::cref`, `std::negate`, `std::logical_not`, `std::mem_fn`, `std::function`, `std::hash`, or from another call to `std::not1` have this type defined, as are function objects derived from the deprecated `std::unary_function`.

## Parameters

- `pred` - unary predicate

## Return value

`std::not1` returns an object of type `std::unary_negate<Predicate>`, constructed with `pred`.

## Exceptions

(none)

## Example

```cpp
#include <algorithm>
#include <functional>
#include <iostream>
#include <iterator>
#include <numeric>
#include <vector>

struct LessThan7 : std::unary_function<int, bool>
{
    bool operator()(int i) const { return i < 7; }
};

int main()
{
    std::vector<int> v(10);
    std::iota(std::begin(v), std::end(v), 0);

    std::cout << std::count_if(begin(v), end(v), std::not1(LessThan7())) << '\n';

    // the same as above using std::function
    std::function<bool(int)> less_than_9 = [](int x) { return x < 9; };
    std::cout << std::count_if(begin(v), end(v), std::not1(less_than_9)) << '\n';
}
```

Output:

```text
3
1
```

## See also

- [`not_fn`](https://en.cppreference.com/w/cpp/utility/functional/not_fn) (C++17): creates a function object that returns the complement of the result of the function object it holds (function template)
- [`unary_negate`](https://en.cppreference.com/w/cpp/utility/functional/unary_negate) (deprecated in C++17): wrapper function object returning the complement of the unary predicate it holds (class template)
- [`function`](https://en.cppreference.com/w/cpp/utility/functional/function) (C++11): copyable wrapper of any copy constructible callable object (class template)
- [`move_only_function`](https://en.cppreference.com/w/cpp/utility/functional/move_only_function) (C++23): move-only wrapper of any callable object that supports qualifiers in a given call signature (class template)
- [`not2`](https://en.cppreference.com/w/cpp/utility/functional/not2) (deprecated in C++17): constructs custom `std::binary_negate` object (function template)
- [`ptr_fun`](https://en.cppreference.com/w/cpp/utility/functional/ptr_fun) (deprecated in C++11): creates an adaptor-compatible function object wrapper from a pointer to function (function template)
- [`unary_function`](https://en.cppreference.com/w/cpp/utility/functional/unary_function) (deprecated in C++11): adaptor-compatible unary function base class (class template)
