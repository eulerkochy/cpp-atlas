# std::mersenne_twister_engine<UIntType,w,n,m,r,a,u,d,s,b,t,c,l,f>::operator()

Source: https://en.cppreference.com/w/cpp/numeric/random/mersenne_twister_engine/operator()

```cpp
result_type operator()(); // (since C++11)
```

Advances the state of the engine, and generates a pseudo-random value from the new state.

## Return value

A pseudo-random number in `[min(),` `max()]`.

## Complexity

Amortized constant.

## See also

- [`discard`](https://en.cppreference.com/w/cpp/numeric/random/mersenne_twister_engine/discard): advances the engine's state by a specified amount (public member function)
