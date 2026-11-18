# std::ios_base::fmtflags

Source: https://en.cppreference.com/w/cpp/io/ios_base/fmtflags

```cpp
typedef /*implementation defined*/ fmtflags;

static constexpr fmtflags dec = /*implementation defined*/
static constexpr fmtflags oct = /*implementation defined*/
static constexpr fmtflags hex = /*implementation defined*/
static constexpr fmtflags basefield = dec | oct | hex;

static constexpr fmtflags left = /*implementation defined*/
static constexpr fmtflags right = /*implementation defined*/
static constexpr fmtflags internal = /*implementation defined*/
static constexpr fmtflags adjustfield = left | right | internal;

static constexpr fmtflags scientific = /*implementation defined*/
static constexpr fmtflags fixed = /*implementation defined*/
static constexpr fmtflags floatfield = scientific | fixed;

static constexpr fmtflags boolalpha = /*implementation defined*/
static constexpr fmtflags showbase = /*implementation defined*/
static constexpr fmtflags showpoint = /*implementation defined*/
static constexpr fmtflags showpos = /*implementation defined*/
static constexpr fmtflags skipws = /*implementation defined*/
static constexpr fmtflags unitbuf = /*implementation defined*/
static constexpr fmtflags uppercase = /*implementation defined*/
```

Specifies available formatting flags. It is a *BitmaskType*. The following constants are defined:

**Constant — Explanation**

- `dec`: use decimal base for integer I/O: see `std::dec`
- `oct`: use octal base for integer I/O: see `std::oct`
- `hex`: use hexadecimal base for integer I/O: see `std::hex`
- `basefield`: `dec | oct | hex`. Useful for masking operations
- `left`: left adjustment (adds fill characters to the right): see `std::left`
- `right`: right adjustment (adds fill characters to the left): see `std::right`
- `internal`: internal adjustment (adds fill characters to the internal designated point): see `std::internal`
- `adjustfield`: `left | right | internal`. Useful for masking operations
- `scientific`: generate floating point types using scientific notation, or hex notation if combined with `fixed`: see `std::scientific`
- `fixed`: generate floating point types using fixed notation, or hex notation if combined with `scientific`: see `std::fixed`
- `floatfield`: `scientific | fixed`. Useful for masking operations
- `boolalpha`: insert and extract `bool` type in alphanumeric format: see `std::boolalpha`
- `showbase`: generate a prefix indicating the numeric base for integer output, require the currency indicator in monetary I/O: see `std::showbase`
- `showpoint`: generate a decimal-point character unconditionally for floating-point number output: see `std::showpoint`
- `showpos`: generate a `+` character for non-negative numeric output: see `std::showpos`
- `skipws`: skip leading whitespace before certain input operations: see `std::skipws`
- `unitbuf`: flush the output after each output operation: see `std::unitbuf`
- `uppercase`: replace certain lowercase letters with their uppercase equivalents in certain output operations: see `std::uppercase`

## Example

The following example shows several different ways to print the same result.

```cpp
#include <iostream>

int main()
{
    const int num = 150;

    // using fmtflags as class member constants:
    std::cout.setf(std::ios_base::hex, std::ios_base::basefield);
    std::cout.setf(std::ios_base::showbase);
    std::cout << num << '\n';

    // using fmtflags as inherited class member constants:
    std::cout.setf (std::ios::hex, std::ios::basefield);
    std::cout.setf (std::ios::showbase);
    std::cout << num << '\n';

    // using fmtflags as object member constants:
    std::cout.setf(std::cout.hex, std::cout.basefield);
    std::cout.setf(std::cout.showbase);
    std::cout << num << '\n';

    // using fmtflags as a type:
    std::ios_base::fmtflags ff;
    ff = std::cout.flags();
    ff &= ~std::cout.basefield;   // unset basefield bits
    ff |= std::cout.hex;          // set hex
    ff |= std::cout.showbase;     // set showbase
    std::cout.flags(ff);
    std::cout << num << '\n';

    // not using fmtflags, but using manipulators:
    std::cout << std::hex << std::showbase << num << '\n';
}
```

Output:

```text
0x96
0x96
0x96
0x96
0x96
```

## See also

- [`flags`](https://en.cppreference.com/w/cpp/io/ios_base/flags): manages format flags (public member function)
- [`setf`](https://en.cppreference.com/w/cpp/io/ios_base/setf): sets specific format flag (public member function)
- [`unsetf`](https://en.cppreference.com/w/cpp/io/ios_base/unsetf): clears specific format flag (public member function)
- [`setbase`](https://en.cppreference.com/w/cpp/io/manip/setbase): changes the base used for integer I/O (function)
- [`setfill`](https://en.cppreference.com/w/cpp/io/manip/setfill): changes the fill character (function template)
- [`fixed`](https://en.cppreference.com/w/cpp/io/manip/fixed), [`scientific`](https://en.cppreference.com/w/cpp/io/manip/fixed), [`hexfloat`](https://en.cppreference.com/w/cpp/io/manip/fixed) (C++11), [`defaultfloat`](https://en.cppreference.com/w/cpp/io/manip/fixed) (C++11): changes formatting used for floating-point I/O (function)
- [`showbase`](https://en.cppreference.com/w/cpp/io/manip/showbase), [`noshowbase`](https://en.cppreference.com/w/cpp/io/manip/showbase): controls whether prefix is used to indicate numeric base (function)
- [`boolalpha`](https://en.cppreference.com/w/cpp/io/manip/boolalpha), [`noboolalpha`](https://en.cppreference.com/w/cpp/io/manip/boolalpha): switches between textual and numeric representation of booleans (function)
- [`showpos`](https://en.cppreference.com/w/cpp/io/manip/showpos), [`noshowpos`](https://en.cppreference.com/w/cpp/io/manip/showpos): controls whether the `+` sign used with non-negative numbers (function)
- [`showpoint`](https://en.cppreference.com/w/cpp/io/manip/showpoint), [`noshowpoint`](https://en.cppreference.com/w/cpp/io/manip/showpoint): controls whether decimal point is always included in floating-point representation (function)
- [`unitbuf`](https://en.cppreference.com/w/cpp/io/manip/unitbuf), [`nounitbuf`](https://en.cppreference.com/w/cpp/io/manip/unitbuf): controls whether output is flushed after each operation (function)
- [`skipws`](https://en.cppreference.com/w/cpp/io/manip/skipws), [`noskipws`](https://en.cppreference.com/w/cpp/io/manip/skipws): controls whether leading whitespace is skipped on input (function)
- [`uppercase`](https://en.cppreference.com/w/cpp/io/manip/uppercase), [`nouppercase`](https://en.cppreference.com/w/cpp/io/manip/uppercase): controls whether uppercase characters are used with some output formats (function)
