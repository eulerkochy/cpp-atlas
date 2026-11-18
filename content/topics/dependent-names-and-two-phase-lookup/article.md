---
title: "Dependent names and two-phase lookup"
summary: "A template is checked twice, once when it is defined and once for each set of arguments. Names that do not depend on the template parameters are bound at the definition, dependent names wait for instantiation, and the parser needs `typename` and `template` to read dependent code before it knows what the names mean."
track: "templates"
minutes: 12
standard:
  - "[temp.res]"
  - "[temp.res.general]"
  - "[temp.dep]"
  - "[temp.dep.type]"
  - "[temp.dep.expr]"
  - "[temp.dep.res]"
  - "[temp.dep.candidate]"
  - "[basic.lookup.argdep]"
cppreference:
  - title: "Dependent names"
    path: "language/dependent_name"
  - title: "Argument-dependent lookup"
    path: "language/adl"
  - title: "Injected-class-name"
    path: "language/injected-class-name"
prerequisites:
  - "name-lookup-and-adl"
  - "template-instantiation-and-specialization"
---

## The one idea

The compiler reads a template definition before it knows the template arguments. Anything in it that does not depend on the template parameters can be checked and resolved immediately, and is. Anything that does depend on them, such as `t.size()` for a parameter `t` of type `T`, can only be resolved when the template is instantiated for a specific `T`. This is **two-phase lookup**: phase one happens at the definition, phase two at each point of instantiation.

Three practical consequences follow. A non-dependent name is bound to whatever is visible at the definition, and later declarations cannot change it. A dependent function call can still find functions declared after the template, but only through argument-dependent lookup. And because the parser must build a syntax tree in phase one, it needs to be told when a dependent name is a type or a template.

> **Mental model.** Phase one asks "what does this mean for every `T`?" and resolves what it can. Phase two fills in the holes for one particular `T`, using argument-dependent lookup as the only window onto declarations that came later.

## What depends on a template parameter

[temp.dep] defines dependency structurally. A **dependent type** is a template parameter, or a type built from one: `T*`, `const T&`, `std::vector<T>`, `T::value_type`, `decltype(t)` where `t` has a dependent type, and so on. An expression is **type-dependent** if its type depends on a template parameter, as `t` and `t + 1` do, and **value-dependent** if its value does, as `sizeof(T)` and a non-type parameter `N` do.

A function call with an unqualified name, such as `f(t)`, is a **dependent call** when any argument is type-dependent. Then the name `f` itself is dependent and is resolved in phase two. A call with no dependent arguments, like `f(1)`, is not dependent, even inside a template.

```cpp
#include <cstdio>

void g(double) { std::puts("g(double)"); }

template<class T> void call(T) { g(1); }  // not dependent: bound to g(double) here

void g(int) { std::puts("g(int)"); }      // too late for call<T>

int main() { call(0); }                    // prints g(double)
```

## Phase one: checked at the definition

In phase one, compilers check syntax, look up every non-dependent name, and diagnose errors in constructs that do not depend on any parameter. GCC and Clang both reject an unqualified call to an undeclared function with no dependent arguments, even in a template that is never instantiated.

```cpp
template<class T> void s() {
  // undeclared();  // error: no arguments depend on T, so a declaration must be visible
}
```

The standard is more permissive about other errors. If no valid specialization of a template could ever be generated, or if a construct that does not depend on a parameter would be ill-formed in a hypothetical instantiation right after the definition, the program is ill-formed with no diagnostic required. Compilers differ in how far they go: Clang 21 rejects `int i = "text";` inside an uninstantiated function template, while GCC 16 says nothing until it instantiates.

> **Standardese.** [temp.res.general] says a program is ill-formed, no diagnostic required, if no valid specialization can be generated for a template, or if a hypothetical instantiation immediately after the definition would be ill-formed because of a construct that does not depend on a template parameter. That is the licence for early diagnosis, not an obligation.

## Phase two: dependent calls and ADL

For a dependent unqualified call, [temp.dep.candidate] combines two lookups. Ordinary unqualified lookup is done only from the template definition context. Argument-dependent lookup is done from both the definition context and the instantiation context. So functions declared after the template are found only if they live in a namespace associated with an argument's type.

```cpp
template<class T> int twice(T t) { return helper(t) * 2; }

namespace lib {
  struct X {};
  int helper(X) { return 21; }   // found by ADL at the point of instantiation
}
int helper(int) { return 1; }    // declared after twice, in the global namespace

int a = twice(lib::X{});         // 42
// int b = twice(0);             // error: int has no associated namespaces,
//                               // and ordinary lookup only saw the definition context
```

That asymmetry is why customization points are found by argument-dependent lookup. A generic algorithm can call `swap(a, b)` unqualified after `using std::swap;`, and the user's `swap` in the user's namespace is found at instantiation even though the algorithm's header was included first. It also explains why such customization does not work for fundamental types: `int` has no associated namespaces, so nothing declared later can be found for it. The general rules of argument-dependent lookup are in the topic on name lookup and ADL.

## `typename` and `template`: telling the parser

In phase one, the compiler does not know whether `T::value_type` names a type, a static data member, or a member template. It assumes a qualified dependent name is not a type unless you say `typename`, and not a template unless you say `template`. The assumption is enforced: without the keyword, the code is parsed as an expression.

```cpp
template<class T> void q() {
  // T::type * ptr;          // parsed as T::type multiplied by ptr, so ptr must exist
  typename T::type* ptr2 = nullptr;  // declares a pointer
  (void)ptr2;
}

template<class T> struct H { template<int N> int get() const { return N; } };

template<class T> int use(const H<T>& h) {
  // return h.get<3>();      // error: parsed as (h.get < 3) > ()
  return h.template get<3>();  // OK: get is a member template
}
```

The same applies to `T::template rebind<U>` and `p->template f<int>()`. The `template` keyword is needed only after `.`, `->` or `::` when the left-hand side is dependent and the name is followed by `<`.

C++20 adopted P0634, which drops the `typename` requirement in contexts where only a type can appear. These include alias declarations, the types of class members and member function returns and parameters, return types and trailing return types of function declarations at namespace scope, the target type of a named cast, and the type in a `new` expression. Inside a function body, where a statement could equally be an expression, `typename` is still required.

```cpp
#include <vector>

template<class T> struct S {
  using V = T::value_type;            // OK since C++20
  T::value_type member;               // OK since C++20
  T::value_type get() const { return member; }  // OK since C++20
  void f() {
    typename T::value_type local{};   // still required in a block
    (void)local;
  }
};
template<class T> T::value_type first(const T& c) { return c[0]; }  // OK since C++20
```

> **Pitfall.** A parameter of a namespace-scope function declaration is not a type-only context unless the declarator is qualified. `template<class T> void p(T::type);` is read as a variable `p` of type `void`, initialized with `T::type`, and rejected. Write `typename` there.

Since C++20, P0846 also lets an unqualified name followed by `<` be treated as a template name when ordinary lookup finds nothing or finds only functions, so `get<0>(t)` finds `std::get` through argument-dependent lookup without a `using` declaration.

## Dependent bases and the current instantiation

Inside a class template, some names are known in phase one even though they are technically dependent. The **current instantiation** is the class being defined: inside `template<class T> struct Node`, the names `Node`, `Node<T>` and `this` all refer to it. Members of the current instantiation are looked up at definition time, so `Node<T>::value_type` needs no `typename` if `value_type` is declared in `Node`, and `this->nope` for a member that does not exist can be diagnosed immediately when the class has no dependent bases.

A base class that depends on a parameter, such as `Base<T>`, is different. It is an **unknown specialization**: someone could explicitly specialize `Base<int>` with completely different members. So unqualified lookup in phase one does not look into dependent bases at all, and an unqualified name used in a derived class template is not found there.

```cpp
template<class T> struct Base { int size() const { return 1; } };

int size() { return 0; }  // an unrelated global function

template<class T> struct Derived : Base<T> {
  int a() const { return this->size(); }    // 1: dependent, found in Base<T> later
  int b() const { return size(); }          // 0: non-dependent, binds to ::size now
  int c() const { return Base<T>::size(); } // 1: qualified (would also suppress virtual dispatch)
};
```

Writing `this->`, qualifying with `Base<T>::`, or adding `using Base<T>::size;` all make the name dependent so it is looked up in phase two. Without a global `size`, `b()` would be a phase-one error: GCC says there are no arguments to `size` that depend on a template parameter. With one, it silently calls the wrong function, which is the nastiest form of this bug. The two disambiguation problems also combine: calling a member template of a dependent base needs both fixes at once, as in `this->template get<0>()`, because `this->get<0>()` would again parse the `<` as less-than. GCC's `-fpermissive` flag turns some of these phase-one errors into warnings, which helps when porting old code but only hides the problem.

> **Pitfall.** Code written for older MSVC versions often relied on finding names in dependent bases without `this->`, because that compiler did not implement two-phase lookup until its `/permissive-` mode. Such code fails on GCC and Clang, or, as above, quietly calls something else.

## What to remember

- Non-dependent names are looked up and bound at the template definition; later declarations do not affect them.
- A call is dependent when an argument is type-dependent; then ordinary lookup uses the definition context and ADL adds the instantiation context.
- Functions declared after a template are found only by ADL, so they are never found for fundamental types.
- A qualified dependent name is assumed to be a value unless marked `typename`, and not a template unless marked `template`.
- C++20 makes `typename` optional where only a type can appear, but not in function bodies or unqualified namespace-scope function parameters.
- Dependent base classes are not searched by unqualified lookup; use `this->`, `Base<T>::` or a using-declaration.
- A template that can never be validly instantiated is ill-formed, no diagnostic required; how early compilers complain varies.
