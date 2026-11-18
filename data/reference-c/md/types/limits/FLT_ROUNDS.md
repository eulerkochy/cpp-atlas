# FLT_ROUNDS

Source: https://en.cppreference.com/w/c/types/limits/FLT_ROUNDS

```cpp
// Defined in header <float.h>
#define FLT_ROUNDS /* implementation defined */
```

Returns the current rounding direction of floating-point arithmetic operations.

**Value — Explanation**

- `-1`: the default rounding direction is not known
- `0`: toward zero; same meaning as `FE_TOWARDZERO`
- `1`: to nearest; same meaning as `FE_TONEAREST`
- `2`: towards positive infinity; same meaning as `FE_UPWARD`
- `3`: towards negative infinity; same meaning as `FE_DOWNWARD`
- other values: implementation-defined behavior

## Notes

The rounding mode can be changed with `fesetround` and `FLT_ROUNDS` reflects that change.

## See also

- [`fegetround`](https://en.cppreference.com/w/c/numeric/fenv/feround) (C99), [`fesetround`](https://en.cppreference.com/w/c/numeric/fenv/feround) (C99): gets or sets rounding direction (function)
- [`FE_DOWNWARD`](https://en.cppreference.com/w/c/numeric/fenv/FE_round) (C99), [`FE_TONEAREST`](https://en.cppreference.com/w/c/numeric/fenv/FE_round), [`FE_TOWARDZERO`](https://en.cppreference.com/w/c/numeric/fenv/FE_round), [`FE_UPWARD`](https://en.cppreference.com/w/c/numeric/fenv/FE_round): floating-point rounding direction (macro constant)
- [C++ documentation for `FLT_ROUNDS`](https://en.cppreference.com/w/cpp/types/climits/FLT_ROUNDS)
