# C++ keyword: struct

Source: https://en.cppreference.com/w/cpp/keyword/struct

## Usage

- declaration of a compound type

(since C++11):

- declaration of a scoped enumeration type

- If a function or a variable exists in scope with the name identical to the name of a non-union class type, `struct` can be prepended to the name for disambiguation, resulting in an elaborated type specifier.

## Example

```cpp
struct Foo; // forward declaration of a struct

struct Bar  // definition of a struct
{
    Bar(int i) : i(i + i) {}

    int i;
};

enum struct Pub // scoped enum, since C++11
{
    b, d, p, q,
};

int main()
{
    Bar Bar(1);
    struct Bar Bar2(2); // elaborated type
}
```

## See also

- [`class`](https://en.cppreference.com/w/cpp/keyword/class), [`union`](https://en.cppreference.com/w/cpp/keyword/union)

(since C++11):

- [`final`](https://en.cppreference.com/w/cpp/identifier_with_special_meaning/final)

- [`enum`](https://en.cppreference.com/w/cpp/keyword/enum)
