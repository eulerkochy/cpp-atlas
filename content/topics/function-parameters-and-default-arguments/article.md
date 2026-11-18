---
title: "Function parameters and default arguments"
summary: "A function's type is built from its adjusted parameter types, so arrays become pointers and top-level const disappears, while default arguments stay outside the type and are bound to the declaration a call happens to see."
track: "expressions-and-functions"
minutes: 12
standard:
  - "[dcl.fct]"
  - "[dcl.fct.default]"
  - "[dcl.ambig.res]"
  - "[expr.call]"
  - "[conv.prom]"
  - "[conv.fpprom]"
  - "[cstdarg.syn]"
  - "[except.spec]"
  - "[conv.fctptr]"
  - "[over.over]"
  - "[class.mem]"
cppreference:
  - title: "Function declaration"
    path: "language/function"
  - title: "Default arguments"
    path: "language/default_arguments"
  - title: "Variadic arguments"
    path: "language/variadic_arguments"
  - title: "Pointer declaration (pointers to functions)"
    path: "language/pointer"
  - title: "Address of an overloaded function"
    path: "language/overloaded_address"
prerequisites:
  - "implicit-conversions"
  - "initialization-forms"
  - "inheritance-and-virtual-functions"
---

## The one idea

A function declaration does two separate jobs. It fixes the function's **type**, which is the return type, the parameter-type-list, and since C++17 whether it is `noexcept`. And it may attach **default arguments**, which are not part of the type at all but a property of that particular declaration.

Almost every surprise in this area comes from mixing the two up. The type is computed after the compiler has rewritten your parameter declarations, so what you wrote is not always what the function takes. Default arguments are substituted by the caller, at compile time, using whatever declaration the call can see and whatever static type the call goes through.

> **Mental model.** The type decides which function you have and what pointers to it look like. Default arguments are a caller-side convenience, pasted in by the compiler from the declaration in view.

## Parameter types are adjusted

[dcl.fct] rewrites each parameter type before the function type is formed. A parameter of type "array of `T`" becomes "pointer to `T`". A parameter of function type becomes a pointer to function. Then top-level `const` and `volatile` are dropped. The resulting list is the parameter-type-list, and it alone determines whether two declarations name the same function.

```cpp
#include <type_traits>

void f(const int a[10]);   // the 10 is ignored; the element const is kept
void f(const int* a);      // redeclares the same function

void g(const int n);       // top-level const is dropped from the type
void g(int n) { n = 1; }   // the definition: n is modifiable here

void h(int callback(int)); // a pointer to function, as if int (*callback)(int)

static_assert(std::is_same_v<decltype(f), void(const int*)>);
static_assert(std::is_same_v<decltype(g), void(int)>);
```

Only the outermost array bound is lost, so `int m[][4]` becomes `int (*)[4]` and the inner bound is part of the type. A reference to an array is not adjusted, which is how `template <std::size_t N> void f(int (&a)[N])` recovers the length. Top-level `const` on a parameter in a definition is legal and only affects the body; repeating it in the header is noise. This also means `sizeof` on an array parameter yields the size of a pointer, which compilers warn about.

## Default arguments are bound at the declaration

A default argument is an expression stored with the declaration. Its names are looked up and bound where the declaration appears, but the expression is evaluated anew at every call that uses it.

```cpp
#include <cstdio>

int level = 1;
void report(int v = level) { std::printf("%d\n", v); }

void demo() {
  int level = 2;   // ignored: the default was bound to ::level
  (void)level;
  ::level = 3;
  report();        // prints 3: ::level is read at the call
}
```

Because the expression is evaluated in the caller's context but bound in the declaration's, the standard restricts what it may name. A default argument may not use `this` or a local variable, and another parameter may not appear in it as a potentially-evaluated expression. That last rule still allows unevaluated uses, so `void f(int a, int b = sizeof(a));` is valid.

```cpp
// void f(int a, int b = a);   // ill-formed: parameter used in a default argument
```

Member functions have one extra freedom. A default argument of a member function declared inside a class is a complete-class context, like a member function body, so it is parsed only after the whole class has been seen and may name members declared later. It still may not use a non-static data member in an evaluated way, because that would need `this`.

```cpp
struct Buffer {
  void resize(int n = default_size);   // OK: default_size is declared below
  static constexpr int default_size = 16;
  int width = 4;
  // void grow(int n = width);         // ill-formed: would need this
  void grow(int n = sizeof(width));    // OK: unevaluated operand
};
```

### Accumulating across declarations

For a non-template function, later declarations in the same scope may add default arguments, but only for parameters to the right of which every parameter already has one, and they may never repeat a default, not even with the same value.

```cpp
#include <cstdio>

void f(int, int);
void f(int, int = 2);    // adds a default for the second parameter
void f(int = 1, int);    // now the first may have one too
// void f(int, int = 2); // ill-formed: redefines a default argument
void f(int a, int b) { std::printf("%d %d\n", a, b); }

void demo() { f(); }     // prints 1 2
```

A declaration in a different scope starts a fresh set. A block-scope declaration of the same function can give it entirely different defaults, visible only in that block. The standard allows it; style guides do not.

> **Standardese.** [dcl.fct.default] says that for non-template functions, default arguments can be added in later declarations of a function in the same scope, and that declarations in different scopes have completely distinct sets of default arguments. Member functions of class templates are stricter: their default arguments must appear on the initial declaration inside the class template.

## Default arguments and virtual functions

Because the caller substitutes the default, it uses the declaration found through the static type of the call. A virtual call still dispatches to the final overrider, but it receives the default argument of the function named by the static type.

```cpp
#include <cstdio>

struct Base {
  virtual void show(int n = 1) const { std::printf("Base %d\n", n); }
  virtual ~Base() = default;
};
struct Derived : Base {
  void show(int n = 2) const override { std::printf("Derived %d\n", n); }
};

void demo() {
  Derived d;
  const Base& b = d;
  b.show();   // prints Derived 1: body from Derived, default from Base
  d.show();   // prints Derived 2
}
```

> **Pitfall.** Never give an override a different default argument. Either repeat the base default or, better, remove defaults from virtual functions and provide a non-virtual wrapper that supplies them.

The same reasoning explains why default arguments vanish through pointers. A pointer to function has only a type, and the type has no defaults, so `void (*p)(int) = report;` must be called with an argument. `std::function` behaves the same way.

## Variadic functions and default argument promotions

A C-style variadic function declares `...` after its named parameters. Arguments that match the ellipsis have no parameter type to convert to, so [expr.call] applies a fixed set of conversions instead: lvalue-to-rvalue, array-to-pointer and function-to-pointer conversions, then the **default argument promotions**. Integer types narrower than `int`, including `bool`, `char` and `short`, are promoted to `int` or `unsigned int`, unscoped enumerations are promoted, and `float` becomes `double`. `std::nullptr_t` becomes `void*`.

```cpp
#include <cstdarg>

double sum(int n, ...) {
  va_list ap;
  va_start(ap, n);
  double s = 0;
  for (int i = 0; i < n; ++i) {
    s += va_arg(ap, double);   // must name the promoted type
  }
  va_end(ap);
  return s;
}

double demo() { float f = 1.5f; return sum(2, f, 2.5); }   // 4: f arrived as double
```

Asking `va_arg` for `float`, `char` or `short` is undefined behaviour, because no argument of that type can arrive. Passing a scoped enumeration, or a class type with a non-trivial copy constructor, move constructor or destructor, through `...` is conditionally-supported with implementation-defined semantics, so do not rely on it. C++ also allows a function with only an ellipsis, `void f(...)`, which overload resolution ranks below every other conversion; that is why it serves as a catch-all in detection idioms. C++26 deprecates writing the ellipsis without a preceding comma, as in `void f(int...)`, because it is easily confused with a parameter pack. Variadic templates, covered in variadic-templates-and-fold-expressions, are the type-safe replacement.

## Declarations that look like objects

[dcl.ambig.res] resolves an ambiguity between a declaration and an expression statement in favour of the declaration. When an initializer in parentheses could be read as a parameter list, it is.

```cpp
struct Timer {};
struct Widget { explicit Widget(Timer) {} int size() const { return 1; } };

void demo() {
  Widget w(Timer());   // declares a function w taking a pointer to function returning Timer
  // w.size();         // ill-formed: w is a function, not an object
  Widget v{Timer{}};   // braces cannot form a parameter list: an object
  (void)v;
}
```

The same rule makes `std::string s();` a function declaration and `int x(int(y));` a declaration of `x` taking an `int` named `y`. Braced initialization, an extra pair of parentheses around the argument, or `=` all force the object reading. The broader choice between initialization syntaxes is the subject of initialization-forms.

## The function type: noexcept, qualifiers and pointers

Since C++17, `noexcept` is part of the function type. A pointer to a `noexcept` function converts implicitly to a pointer to a potentially-throwing one, but not the other way, because that would promise something the function does not. You still cannot overload on `noexcept` alone, and every declaration of a function must agree on its exception specification. The noexcept topic covers what the specifier promises at run time.

```cpp
void may_throw() {}
void no_throw() noexcept {}

void (*p)() = no_throw;               // OK: drops the guarantee
// void (*q)() noexcept = may_throw;  // ill-formed: would add a guarantee
```

For member functions, cv-qualifiers and ref-qualifiers are also part of the type, as described in member-functions-and-this.

A function name converts to a pointer to function, so `p = f` and `p = &f` mean the same thing, and calling through `p(1)`, `(*p)(1)` or even `(**p)(1)` all work, because dereferencing gives back a function lvalue that decays again. When the name is overloaded, the target type chooses: `void (*ph)(double) = h;` selects `h(double)` from the set, under the rules of [over.over]. Since C++20, the standard library says that taking the address of most standard library functions is unspecified or ill-formed, so pass a lambda instead of `&std::toupper`.

## What to remember

- The function type is formed from adjusted parameters: arrays and functions become pointers, and top-level cv-qualifiers are dropped.
- Only the outermost array bound is lost; references to arrays keep their bound.
- Default arguments are not part of the type: they are bound by name at the declaration and evaluated at each call.
- A default argument cannot use `this`, locals, or other parameters in evaluated contexts.
- Later declarations in the same scope may add defaults right to left but never repeat one; other scopes get a fresh set.
- A virtual call uses the default from the static type and the body from the dynamic type.
- Arguments passed to `...` undergo default argument promotions; `va_arg` must name the promoted type.
- If something can be read as a function declaration, it is; braces avoid the most vexing parse.
- Since C++17 `noexcept` is in the type, and pointers convert only from `noexcept` to potentially-throwing.
