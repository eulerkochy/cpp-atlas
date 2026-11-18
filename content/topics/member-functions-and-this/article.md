---
title: "Member functions and this"
summary: "A non-static member function is an ordinary function with one extra parameter, the object it is called on. Qualifiers, overloading, `this` and C++23's explicit object parameters all follow from taking that parameter seriously."
track: "classes"
minutes: 12
standard:
  - "[class.mfct]"
  - "[class.mfct.non.static]"
  - "[over.match.funcs]"
  - "[expr.prim.this]"
  - "[dcl.fct]"
  - "[class.mem]"
  - "[class.static]"
  - "[dcl.inline]"
  - "[expr.prim.lambda.capture]"
cppreference:
  - title: "Non-static member functions"
    path: "language/member_functions"
  - title: "The this pointer"
    path: "language/this"
  - title: "Function declaration (explicit object parameter)"
    path: "language/function"
  - title: "static members"
    path: "language/static"
prerequisites:
  - "value-categories"
  - "overload-resolution"
---

## The one idea

A non-static member function is a function with one more parameter than you wrote: the object it is called on. The standard calls it the **object parameter**. For a classic member function it is implicit, and its type is a reference to the class, shaped by the qualifiers after the parameter list. Since C++23 you may also write it out yourself as an **explicit object parameter**, spelled with `this` in front.

Everything else in this topic is a consequence. `const` after the parameter list changes the type of that hidden parameter, so it can be overloaded on. A ref-qualifier says whether the parameter is an lvalue or rvalue reference. A static member function is the case with no object parameter at all, which is why it has no `this`. And `this` itself is just the address of whatever the hidden reference is bound to.

> **Mental model.** Read `int S::get() const &` as `int get(const S& self)`. Overload resolution treats it that way, with a couple of special cases, and so should you.

## The implicit object parameter and cv-qualifiers

For overload resolution, [over.match.funcs] gives every implicit object member function an implicit object parameter. Without a ref-qualifier its type is "lvalue reference to cv `X`", where cv comes from the function's own qualifiers. The object expression, the thing left of the dot, is the implied argument. Calling a non-const member function on a const object therefore fails for the same reason that binding `const S` to `S&` fails, and overloading on `const` is ordinary overloading on the type of a reference parameter.

```cpp
#include <cstdio>

struct Buffer {
  void data()       { std::puts("non-const"); }
  void data() const { std::puts("const"); }
};

void use(Buffer& b, const Buffer& cb) {
  b.data();   // non-const: exact match for Buffer&
  cb.data();  // const: only candidate that binds const Buffer
}
```

Inside the body, `this` is a prvalue whose type is a pointer to the cv-qualified class: `const Buffer*` in the const overload. A `mutable` member escapes that, and so does anything reached through a pointer member, because constness applies to the object's own members and not to what they point at.

There is one exception that the "it is just a reference" picture does not predict. For a member function declared **without** a ref-qualifier, an rvalue may bind to the implicit object parameter even though the parameter is a non-const lvalue reference. That is why `std::string("abc").append("d")` has always compiled.

> **Standardese.** [over.match.funcs] says that for implicit object member functions declared without a ref-qualifier, even if the implicit object parameter is not const-qualified, an rvalue can be bound to it, provided that in all other respects the argument could be converted to its type.

## Ref-qualifiers: overloading on the object's value category

C++11 added `&` and `&&` after the parameter list. With `&` the object parameter is an lvalue reference and the rvalue exception above no longer applies. With `&&` it is an rvalue reference, so the function is only viable on rvalues. The standard library uses this for accessors such as `std::optional::value`, which returns `T&&` when called on an rvalue optional so that the contained value can be moved out.

You cannot mix the two styles freely. If one overload of a name with a given parameter list has a ref-qualifier, an overload with the same object type and no ref-qualifier is ill-formed. Clang rejects such a pair at the declaration; GCC 16 accepts the declarations and reports an ambiguity at the call.

The surprise is inside the body. A ref-qualifier changes which objects you can call the function on, but `*this` is still an lvalue expression, and so is every member you name. Moving out of an rvalue-qualified function needs an explicit cast.

```cpp
#include <cstdio>
#include <string>
#include <utility>

struct Holder {
  std::string name = "x";
  static void sink(std::string&)  { std::puts("lvalue"); }
  static void sink(std::string&&) { std::puts("rvalue"); }

  void take() && {
    sink(name);                    // lvalue: a named member is an lvalue
    sink(std::move(*this).name);   // rvalue: member of an xvalue is an xvalue
  }
};

int main() { Holder{}.take(); }    // prints lvalue, then rvalue
```

## Explicit object parameters (C++23)

P0847, known as "deducing this", lets you declare the object parameter as the first function parameter, prefixed by `this`. The function is then an **explicit object member function**. It is called with the usual `obj.f()` syntax, but inside it there is no `this` pointer and no implicit member access: you must write `self.x`, exactly as in a free function.

```cpp
#include <type_traits>

struct Base {
  template <class Self>
  int which(this Self&&) {
    return std::is_same_v<std::remove_cvref_t<Self>, Base> ? 1 : 2;
  }
};
struct Derived : Base {};

int demo() {
  Derived d;
  Base& b = d;
  return d.which() * 10 + b.which();   // 21: Self deduces from the static type
}
```

The template parameter is deduced from the object expression, so one function template replaces the const, non-const, lvalue and rvalue overloads that accessors used to need. Deduction sees the **static** type of the expression, not the dynamic type, which is why `b.which()` deduces `Base&`. The patterns built on this, such as replacing the curiously recurring template pattern, belong to the topic on CRTP and deducing this.

A few rules keep the feature coherent. An explicit object member function cannot be `static`, `virtual`, or carry cv- or ref-qualifiers, since the parameter type already says all of that. The object parameter may be taken by value, written `this S self`, in which case a call copies or moves the object. And because the function has no hidden parameter left, taking its address gives a plain function pointer.

```cpp
#include <type_traits>

struct E {
  int v = 0;
  int get(this const E& self) { return self.v; }
};

static_assert(std::is_same_v<decltype(&E::get), int (*)(const E&)>);
// not int (E::*)() const: call it as (&E::get)(e)
```

Explicit object parameters also solve recursive lambdas: `[](this auto self, int n) { ... self(n - 1); }` names the closure object without `std::function` or a Y combinator.

## Static members

A static member function has no object parameter, so it has no `this`, cannot be `const` or ref-qualified, and cannot name non-static members without an object. You can still call it as `obj.f()`. For overload resolution, [over.match.funcs] gives it an implicit object parameter that accepts any object, which lets static and non-static overloads compete in one set. C++23 permits `static operator()` and `static operator[]`, so a stateless function object no longer passes an object pointer it never reads.

A static data member is one object shared by the class. Declared in the class without `inline`, it is only a declaration, and an odr-use needs a definition in exactly one translation unit. C++17 added `inline static` data members, which are definitions in the class body, and made every `static constexpr` data member implicitly inline.

```cpp
struct Limits {
  static constexpr int max = 64;   // definition: constexpr implies inline (C++17)
  static const int min = 0;        // declaration only: not inline
  inline static int calls = 0;     // definition (C++17)
};

const int& r = Limits::max;        // OK: odr-use, and a definition exists
// const int& s = Limits::min;     // odr-use with no definition anywhere:
//                                 // ill-formed, no diagnostic required (link error)
```

## Definitions in the class and the complete-class context

A member function defined inside its class definition is implicitly an inline function, per [class.mfct] and [dcl.inline]. That is what lets header-only classes appear in many translation units without violating the one definition rule. The exception is C++20 modules: a member function defined in a class that is attached to a named module is not implicitly inline.

Inside a class, some places are a **complete-class context**: function bodies, default arguments, `noexcept` specifiers and default member initializers. In those places the class is regarded as complete, so names declared later in the class are visible. Everywhere else in the class, ordinary top-to-bottom lookup applies, which bites in return types and parameter types.

```cpp
struct S {
  auto f() noexcept(noexcept(g())) { return g(); }  // OK: body and noexcept
  int g() noexcept { return 1; }                    //     see the later g
  // size_type h();      // error: return type is not a complete-class context
  using size_type = int;
};
```

> **Pitfall.** The fix for the commented line is to move the alias above its first use. Member type aliases are conventionally declared at the top of a class for exactly this reason.

## `this` in lambdas and default member initializers

`this` may appear in the body of an implicit object member function, in its trailing return type and `noexcept` specifier, and in default member initializers, where it points to the object being initialized. A member such as `Node* self = this;` is valid, and later members may read earlier ones, because members are initialized in declaration order.

A lambda in a member function reaches members through the captured `this` pointer. `[this]` captures the pointer, so the lambda refers to the original object and dangles if it outlives it. `[*this]`, added in C++17, copies the whole object into the closure. The default `[=]` used to capture `this` implicitly, which looked like a copy but was a pointer capture; C++20 deprecated that implicit capture, and `[=, this]` became the way to say it explicitly.

```cpp
#include <functional>

struct Counter {
  int n = 0;
  std::function<int()> by_pointer() { return [this]  { return n; }; }
  std::function<int()> by_copy()    { return [*this] { return n; }; }
  std::function<int()> legacy()     { return [=]     { return n; }; }
  // legacy: captures this, not *this; deprecated since C++20
};
```

An explicit object member function has no `this` to capture, so a lambda inside it must capture `self` by reference or by copy like any other parameter.

## What to remember

- A non-static member function has an object parameter; cv- and ref-qualifiers set its type, and overloading on them is ordinary overloading.
- Without a ref-qualifier, rvalues may bind to the implicit object parameter even when it is non-const.
- Inside a `&&`-qualified function, `*this` and named members are still lvalues; use `std::move(*this)`.
- C++23 explicit object parameters deduce from the static type of the object expression and leave no `this`; their address is an ordinary function pointer.
- Static member functions have no `this`; C++23 allows `static operator()` and `static operator[]`.
- `static constexpr` data members are implicitly inline since C++17; plain `static const` members are not.
- In-class member function definitions are implicitly inline, except when attached to a named module.
- Bodies, default arguments, `noexcept` specifiers and default member initializers see the whole class; return and parameter types do not.
- `[this]` captures a pointer, `[*this]` a copy, and implicit `this` capture through `[=]` is deprecated in C++20.
