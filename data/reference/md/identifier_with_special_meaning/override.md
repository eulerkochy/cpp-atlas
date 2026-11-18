# C++ identifier with special meaning: override (since C++11)

Source: https://en.cppreference.com/w/cpp/identifier_with_special_meaning/override

## Usage

- `override` specifier

## Example

```cpp
struct b
{
    void f0() {};
    void f1() {};
    virtual void f2() {};
    virtual void f3() {};
    virtual void f4() {};
    virtual void f5() {};
};

struct d : b
{
    void f0() {};                        // OK. Neither: b::f0 nor d::f0 are virtual.
    void f1() override {};               // Error: cannot override non-virtual b::f1.
    void f2() override {};               // OK. Member function d::f2 is virtual.
    virtual void f3() {};                // OK. Specifier 'override'  is optional.
    virtual void f4() override {};       // OK. 'override' ensures b::f4 is virtual.
    virtual void f5() override final {}; // OK. d::f5 is both overriden and final.
};
```

## See also

- [`virtual`](https://en.cppreference.com/w/cpp/keyword/virtual), [`final`](https://en.cppreference.com/w/cpp/identifier_with_special_meaning/final)
