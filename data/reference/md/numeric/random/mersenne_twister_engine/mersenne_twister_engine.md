# std::mersenne_twister_engine<UIntType,w,n,m,r,a,u,d,s,b,t,c,l,f>::mersenne_twister_engine

Source: https://en.cppreference.com/w/cpp/numeric/random/mersenne_twister_engine/mersenne_twister_engine

```cpp
mersenne_twister_engine() : mersenne_twister_engine(default_seed) {} // (1) (since C++11)

explicit mersenne_twister_engine( result_type value ); // (2) (since C++11)

template< class SeedSeq >
explicit mersenne_twister_engine( SeedSeq& seq ); // (3) (since C++11)

mersenne_twister_engine( const mersenne_twister_engine& other ); // (4) (since C++11) (implicitly declared)
```

Constructs the pseudo-random number engine.

1) The default constructor.

   - If the default-constructed engine is of type `std::mt19937`, the 10000th consecutive invocation of it produces the value `4123659995`.
   - If the default-constructed engine is of type `std::mt19937_64`, the 10000th consecutive invocation of it produces the value `9981545732273789042`.

2) Constructs the engine with a seed value `value`. Given 2^(w) as `p`, the engine's initial state is determined as follows:

   1. Sets X⁻ⁿ to `value % p`.
   2. For each integer `i` in `[i - n,` `-1]`, sets Xⁱ to [f·(Xⁱ⁻¹ xor (Xⁱ⁻¹ rshift (w-2)))+i mod n] mod p, where xor and rshift stand for built-in bitwise XOR and bitwise right-shift respectively.

3) Constructs the engine with a seed sequence `seq`. Given `std::size_t(w / 32) + 1` as `k`, the engine's initial state is determined as follows:

   1. Creates an invented array object `a` of length `n * k`.
   2. Calls `seq.generate(a + 0, a + n * k)`.
   3. For each integer `i` in `[-n,` `-1]`, sets Xⁱ to (∑^(k-1)_(j=0) a^(k(i+n)+j)·2^(32j)) mod 2^(w).
   4. If the most significant `w − r` bits of X⁻ⁿ are zero, and if each of the other resulting Xⁱ is `​0​`, changes X⁻ⁿ to 2^(w-1).

This overload participates in overload resolution only if `SeedSeq` meets the requirements of *SeedSequence*.

4) The copy constructor. Upon construction, `*this == other` is `true`.

## Parameters

- `value` - seed value to use in the initialization of the internal state
- `seq` - seed sequence to use in the initialization of the internal state

## Complexity

1,2) O(n).

3) Same as the complexity of the `seq.generate` call.

4) O(n).

## Exceptions

3) If `SeedSeq` is not `std::seed_seq`, throws the exceptions thrown by the `seq.generate` call.

## Example

> Note: This section is incomplete Reason: demos for overloads (2-4) required

```cpp
#include <cassert>
#include <random>

int main()
{
    std::mt19937 gen32; // overload (1)
    std::mt19937_64 gen64; // overload (1)
    gen32.discard(10000 - 1);
    gen64.discard(10000 - 1);
    assert(gen32() == 4123659995);
    assert(gen64() == 9981545732273789042ull);
}
```

## Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| LWG 2181 | C++11 | overload (3) would not throw even if the `seq.generate` call throws | propagates the exception |
| P0935R0 | C++11 | the default constructor was explicit | made implicit |

## See also

- [`seed`](https://en.cppreference.com/w/cpp/numeric/random/mersenne_twister_engine/seed): sets the current state of the engine (public member function)
