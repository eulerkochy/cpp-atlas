# std::exponential_distribution<RealType>::lambda

Source: https://en.cppreference.com/w/cpp/numeric/random/exponential_distribution/lambda

```cpp
RealType lambda() const; // (since C++11)
```

Returns the λ distribution parameter the distribution was constructed with. The parameter defines the rate of events, per unit. The default value is `1.0`.

## Parameters

(none)

## Return value

Floating point value identifying the rate of events per unit.

## See also

- [`param`](https://en.cppreference.com/w/cpp/numeric/random/exponential_distribution/param) (C++11): gets or sets the distribution parameter object (public member function)
