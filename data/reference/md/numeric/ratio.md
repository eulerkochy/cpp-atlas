# Compile-time rational arithmetic (since C++11)

Source: https://en.cppreference.com/w/cpp/numeric/ratio

The class template `std::ratio` and associated templates provide compile-time rational arithmetic support. Each instantiation of this template exactly represents any finite rational number.

## Compile-time fractions

Defined in header `<ratio>`

- `ratio` (C++11): represents exact rational fraction (class template)

The following convenience typedefs that correspond to the SI ratios are provided by the standard library:

Defined in header `<ratio>`

**Type — Definition**

- `quecto` (since C++26): `std::ratio<1, 1000000000000000000000000000000>` (10⁻³⁰)[1]
- `ronto` (since C++26): `std::ratio<1, 1000000000000000000000000000>` (10⁻²⁷)[1]
- `yocto` (since C++11): `std::ratio<1, 1000000000000000000000000>` (10⁻²⁴)[1]
- `zepto` (since C++11): `std::ratio<1, 1000000000000000000000>` (10⁻²¹)[1]
- `atto` (since C++11): `std::ratio<1, 1000000000000000000>` (10⁻¹⁸)
- `femto` (since C++11): `std::ratio<1, 1000000000000000>` (10⁻¹⁵)
- `pico` (since C++11): `std::ratio<1, 1000000000000>` (10⁻¹²)
- `nano` (since C++11): `std::ratio<1, 1000000000>` (10⁻⁹)
- `micro` (since C++11): `std::ratio<1, 1000000>` (10⁻⁶)
- `milli` (since C++11): `std::ratio<1, 1000>` (10⁻³)
- `centi` (since C++11): `std::ratio<1, 100>` (10⁻²)
- `deci` (since C++11): `std::ratio<1, 10>` (10⁻¹)
- `deca` (since C++11): `std::ratio<10, 1>` (10¹)
- `hecto` (since C++11): `std::ratio<100, 1>` (10²)
- `kilo` (since C++11): `std::ratio<1000, 1>` (10³)
- `mega` (since C++11): `std::ratio<1000000, 1>` (10⁶)
- `giga` (since C++11): `std::ratio<1000000000, 1>` (10⁹)
- `tera` (since C++11): `std::ratio<1000000000000, 1>` (10¹²)
- `peta` (since C++11): `std::ratio<1000000000000000, 1>` (10¹⁵)
- `exa` (since C++11): `std::ratio<1000000000000000000, 1>` (10¹⁸)
- `zetta` (since C++11): `std::ratio<1000000000000000000000, 1>` (10²¹)[2]
- `yotta` (since C++11): `std::ratio<1000000000000000000000000, 1>` (10²⁴)[2]
- `ronna` (since C++26): `std::ratio<1000000000000000000000000000, 1>` (10²⁷)[2]
- `quetta` (since C++26): `std::ratio<1000000000000000000000000000000, 1>` (10³⁰)[2]

1. ↑ 1.0 1.1 1.2 1.3 These typedefs are only declared if `std::intmax_t` can represent the denominator.
2. ↑ 2.0 2.1 2.2 2.3 These typedefs are only declared if `std::intmax_t` can represent the numerator.

## Compile-time rational arithmetic

Several alias templates, that perform arithmetic operations on `ratio` objects at compile-time are provided.

Defined in header `<ratio>`

- `ratio_add` (C++11): adds two `ratio` objects at compile-time (alias template)
- `ratio_subtract` (C++11): subtracts two `ratio` objects at compile-time (alias template)
- `ratio_multiply` (C++11): multiplies two `ratio` objects at compile-time (alias template)
- `ratio_divide` (C++11): divides two `ratio` objects at compile-time (alias template)

## Compile-time rational comparison

Several class templates, that perform comparison operations on `ratio` objects at compile-time are provided.

Defined in header `<ratio>`

- `ratio_equal` (C++11): compares two `ratio` objects for equality at compile-time (class template)
- `ratio_not_equal` (C++11): compares two `ratio` objects for inequality at compile-time (class template)
- `ratio_less` (C++11): compares two `ratio` objects for *less than* at compile-time (class template)
- `ratio_less_equal` (C++11): compares two `ratio` objects for *less than or equal to* at compile-time (class template)
- `ratio_greater` (C++11): compares two `ratio` objects for *greater than* at compile-time (class template)
- `ratio_greater_equal` (C++11): compares two `ratio` objects for *greater than or equal to* at compile-time (class template)
