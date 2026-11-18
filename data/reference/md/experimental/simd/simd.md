# std::experimental::simd

Source: https://en.cppreference.com/w/cpp/experimental/simd/simd

```cpp
// Defined in header <experimental/simd>

template< class T, class Abi = simd_abi::compatible<T> >
class simd; // (parallelism TS v2)
```

The class template `simd` is a data-parallel type. The width of a given `simd` instantiation is a constant expression, determined by the template parameters.

An ABI tag is a type in the `simd_abi` namespace that indicates a choice of size and binary representation for objects of data-parallel type.

## Template parameters

- `T` - element type; an arithmetic type other than `bool`
- `Abi` - tag type used to determine the number of elements and storage

## Helper alias templates

```cpp
template< class T, int N >
using fixed_size_simd = std::experimental::simd<T, std::experimental::simd_abi::fixed_size<N>>;

template< class T >
using native_simd = std::experimental::simd<T, std::experimental::simd_abi::native<T>>;
```

## Member types

**Member type — Definition**

- `value_type`: `T`
- `reference`: implementation-defined
- `mask_type`: `simd_mask<T, Abi>`
- `abi_type`: `Abi`

## Member functions

- (constructor) (parallelism TS v2): constructs a `simd` object (public member function)
- `copy_from` (parallelism TS v2): loads `simd` elements from contiguous memory (public member function)
- `copy_to` (parallelism TS v2): stores `simd` elements to contiguous memory (public member function)
- `operator[]` (parallelism TS v2): accesses specified element (public member function)
- `operator++` (parallelism TS v2), `operator--`: element-wise increment and decrement (public member function)
- `operator!` (parallelism TS v2), `operator~`, `operator+`, `operator-`: element-wise unary operators (public member function)
- `size` [static] (parallelism TS v2): returns the width / number of elements (public static member function)

## Non-member functions

- `operator+` (parallelism TS v2), `operator-`, `operator*`, `operator/`, `operator%`, `operator&`, `operator|`, `operator^`, `operator<<`, `operator>>`: element-wise binary operators (function)
- `operator+=` (parallelism TS v2), `operator-=`, `operator*=`, `operator/=`, `operator%=`, `operator&=`, `operator|=`, `operator^=`, `operator<<=`, `operator>>=`: element-wise compound binary operators (function)
- `operator==` (parallelism TS v2), `operator!=`, `operator>=`, `operator<=`, `operator>`, `operator<`: element-wise relational operators (function)

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`simd_mask`](https://en.cppreference.com/w/cpp/experimental/simd/simd_mask) (parallelism TS v2): data-parallel type with the element type bool (class template)
- [`valarray`](https://en.cppreference.com/w/cpp/numeric/valarray): numeric arrays, array masks and array slices (class template)
