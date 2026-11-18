# INFINITY

Source: https://en.cppreference.com/w/cpp/numeric/math/INFINITY

```cpp
// Defined in header <cmath>
#define INFINITY /*implementation defined*/ // (since C++11)
```

If the implementation supports floating-point infinities, the macro `INFINITY` expands to constant expression of type `float` which evaluates to positive or unsigned infinity.

If the implementation does not support floating-point infinities, the macro `INFINITY` expands to a positive value that is guaranteed to overflow a `float` at compile time, and the use of this macro generates a compiler warning.

## See also

- [`isinf`](https://en.cppreference.com/w/cpp/numeric/math/isinf) (C++11): checks if the given number is infinite (function)
- [`HUGE_VALF`](https://en.cppreference.com/w/cpp/numeric/math/HUGE_VAL) (C++11), [`HUGE_VAL`](https://en.cppreference.com/w/cpp/numeric/math/HUGE_VAL), [`HUGE_VALL`](https://en.cppreference.com/w/cpp/numeric/math/HUGE_VAL) (C++11): indicates the overflow value for `float`, `double` and `long double` respectively (macro constant)
- [`has_infinity`](https://en.cppreference.com/w/cpp/types/numeric_limits/has_infinity) [static]: identifies floating-point types that can represent the special value "positive infinity" (public static member constant of `std::numeric_limits<T>`)
- [`infinity`](https://en.cppreference.com/w/cpp/types/numeric_limits/infinity) [static]: returns the positive infinity value of the given floating-point type (public static member function of `std::numeric_limits<T>`)
- [C documentation for `INFINITY`](https://en.cppreference.com/w/c/numeric/math/INFINITY)
