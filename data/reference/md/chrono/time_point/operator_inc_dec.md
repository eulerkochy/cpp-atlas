# std::chrono::time_point<Clock,Duration>::operator++, std::chrono::time_point<Clock,Duration>::operator--

Source: https://en.cppreference.com/w/cpp/chrono/time_point/operator_inc_dec

```cpp
constexpr time_point& operator++(); // (1) (since C++20)
constexpr time_point operator++( int ); // (2) (since C++20)
constexpr time_point& operator--(); // (3) (since C++20)
constexpr time_point operator--( int ); // (4) (since C++20)
```

Modifies the point in time `*this` represents by one tick of the `duration`.

If `d_` is a member variable holding the duration (i.e., time since epoch) of this `time_point` object,

1) Equivalent to `++d_; return *this;`.

2) Equivalent to `return time_point(d_++)`.

3) Equivalent to `--d_; return *this;`.

4) Equivalent to `return time_point(d_--);`.

## Parameters

(none)

## Return value

1,3) A reference to this `time_point` after modification.

2,4) A copy of the `time_point` made before modification.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`operator++`](https://en.cppreference.com/w/cpp/chrono/duration/operator_arith2), [`operator++(int)`](https://en.cppreference.com/w/cpp/chrono/duration/operator_arith2), [`operator--`](https://en.cppreference.com/w/cpp/chrono/duration/operator_arith2), [`operator--(int)`](https://en.cppreference.com/w/cpp/chrono/duration/operator_arith2): increments or decrements the tick count (public member function of `std::chrono::duration<Rep,Period>`)
- [`operator+=`](https://en.cppreference.com/w/cpp/chrono/time_point/operator_arith), [`operator-=`](https://en.cppreference.com/w/cpp/chrono/time_point/operator_arith): modifies the time point by the given duration (public member function)
- [`operator+`](https://en.cppreference.com/w/cpp/chrono/time_point/operator_arith2) (C++11), [`operator-`](https://en.cppreference.com/w/cpp/chrono/time_point/operator_arith2): performs add and subtract operations involving a time point (function template)
