# std::philox_engine<UIntType,w,n,r,consts>::seed

Source: https://en.cppreference.com/w/cpp/numeric/random/philox_engine/seed

```cpp
void seed( result_type value = default_seed ); // (1) (since C++26)

template< class SeedSeq >
void seed( SeedSeq& seq ); // (2) (since C++26)
```

Sets the state of the random-number engine.

1) Right after the state is set, `*this == std::philox_engine(value)` is `true`.

2) Right after the state is set, `*this == std::philox_engine(seq)` is `true`.

## Parameters

- `value` - seed value to use to set the state
- `seq` - seed sequence to use to set the state

## Exceptions

2) If `SeedSeq` is not `std::seed_seq`, throws the exceptions thrown by the `seq.generate` call.

## Complexity

1) Same as `std::philox_engine(value)`.

2) Same as `std::philox_engine(seq)`.

## See also

- [(constructor)](https://en.cppreference.com/w/cpp/numeric/random/philox_engine/philox_engine): constructs the engine (public member function)
- [`set_counter`](https://en.cppreference.com/w/cpp/numeric/random/philox_engine/set_counter): sets the current counter of the engine (public member function)
