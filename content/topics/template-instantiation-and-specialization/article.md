---
title: "Template instantiation and specialization"
summary: "A template is a recipe, and a specialization is what you get for one set of arguments, either cooked by the compiler on demand or written by you in advance. Knowing when the compiler cooks, and what your hand-written versions replace, explains lazy members, extern template and the classic function-specialization surprise."
track: "templates"
minutes: 12
standard:
  - "[temp.spec]"
  - "[temp.inst]"
  - "[temp.point]"
  - "[temp.explicit]"
  - "[temp.expl.spec]"
  - "[temp.spec.partial]"
  - "[temp.over]"
cppreference:
  - title: "Explicit (full) template specialization"
    path: "language/template_specialization"
  - title: "Partial template specialization"
    path: "language/partial_specialization"
  - title: "Class template (explicit instantiation)"
    path: "language/class_template"
  - title: "Function template"
    path: "language/function_template"
  - title: "Variable template"
    path: "language/variable_template"
prerequisites:
  - "one-definition-rule"
  - "translation-units-and-linkage"
---

## The one idea

A template is not code; it is a recipe for code. Every distinct set of template arguments names a **specialization**: `Box<int>` and `Box<double>` are two specializations of `Box`, as unrelated to each other as two hand-written classes. A specialization comes into existence in one of two ways. Either the compiler **instantiates** it from the template, implicitly because you used it or explicitly because you asked, or you supply its definition yourself as an **explicit specialization** or a **partial specialization**.

The rest of the topic is about the consequences. The compiler instantiates as little as it can get away with, so code that would not compile is harmless until something needs it. A hand-written specialization replaces the recipe for its arguments, so it must be visible before anyone asks the compiler to cook. And for function templates, hand-written specializations do not compete in overload resolution, which surprises nearly everyone once.

> **Mental model.** Overload resolution and partial specialization matching choose a *recipe*. An explicit specialization is a pre-cooked dish for one exact order of that recipe. It is served only after the recipe has already been chosen.

## Implicit instantiation is lazy

Using `Box<int>` in a way that needs a complete type implicitly instantiates the class. That instantiates the *declarations* of its members, including member types, data members and function signatures, but not the *definitions* of its member functions, its default arguments, its member classes or its static data members. A member function body is instantiated only when the function is odr-used, or otherwise needed.

```cpp
template<class T> struct Box {
  T value;
  void bad() { value.frobnicate(); }  // checked only if bad() is used
  using ptr = T*;                     // a declaration: instantiated with the class
};

Box<int> ok{1};          // fine: Box<int>::bad is declared, never defined
Box<int&>* p = nullptr;  // fine: a pointer to Box<int&> needs no complete type
// ok.bad();             // error: int has no member frobnicate
// int x; Box<int&> r{x}; // error: forming a pointer to int& in 'using ptr'
```

This laziness is a feature the standard library depends on. `std::vector<T>` has a copy constructor that would fail for move-only `T`, and `std::optional<T>` has comparison operators that require `T` to be comparable. Neither matters until you call them. Naming a specialization without requiring completeness, as in a pointer or reference to it, does not instantiate the class at all.

Templates are also checked at definition time for things that do not depend on the parameters, so laziness does not mean anything goes. That first-phase check is the subject of the topic on dependent names and two-phase lookup.

## Points of instantiation

A specialization is instantiated as though at a particular place in the translation unit, its **point of instantiation**. For a function template specialization used inside a namespace-scope declaration, that point is immediately after the declaration. For a class template specialization, it is immediately before the namespace-scope declaration that needed it. Names that depend on the template parameters are looked up, by argument-dependent lookup, as of that point.

The standard adds a twist for function templates: the end of the translation unit is *also* a point of instantiation. If two points give the specialization different meanings, the program is ill-formed, no diagnostic required.

```cpp
namespace n {
  struct A {};
  int score(const A&) { return 1; }
}
template<class T> int pick(T t) { return score(t); }

int first = pick(n::A{});  // a point of instantiation of pick<n::A> follows this line

namespace n { int score(A&) { return 2; } }  // a better match for the lvalue t
// The end of the file is another point of instantiation, where score(A&) wins.
// Ill-formed, no diagnostic required. GCC 16 and Clang 21 both set first to 2,
// because they actually instantiate function bodies at the end of the file.
```

> **Standardese.** [temp.point] lets a function template specialization have several points of instantiation in one translation unit, always including the end of the unit, and makes the program ill-formed, no diagnostic required, if they would give the specialization different meanings under the one-definition rule.

## Explicit instantiation and `extern template`

An **explicit instantiation definition** forces a specialization to be instantiated here: `template struct Box<int>;` or `template int twice<int>(int);`. For a class, it instantiates every member that has been defined at that point, which defeats the laziness above. An **explicit instantiation declaration**, spelled with `extern`, promises that a definition exists in some other translation unit and suppresses implicit instantiation of the entity's definition in this one.

```cpp
template<class T> T twice(T x) { return x + x; }

template int twice<int>(int);       // explicit instantiation definition
template double twice(double);      // the argument can be deduced
extern template long twice(long);   // declaration: instantiate it elsewhere

// template struct Box<int>;   // with Box from above: error, this instantiates bad()
```

The usual pattern puts `extern template` in a header after the template's definition and a matching explicit instantiation definition in exactly one source file, so that dozens of translation units stop compiling and emitting the same code. Two details matter. First, the suppression does not apply to inline functions, `constexpr` functions, or functions whose return type is deduced, so member functions defined inside the class body may still be instantiated for inlining. Second, if you use the entity and no explicit instantiation definition exists anywhere, the program is ill-formed, no diagnostic required. In practice that shows up as an undefined symbol at link time.

> **Pitfall.** An explicit instantiation definition checks every member body. With GCC's standard library, `template class std::vector<std::unique_ptr<int>>;` fails to compile, because it instantiates the copy constructor that implicit use would never touch. Explicitly instantiate only types that support every member.

## Explicit specialization

An explicit specialization, introduced by `template<>`, provides the definition for one exact set of arguments. For a class template it is a completely separate class: it inherits no members from the primary template, and it may have a different layout, different members, or no definition at all. You can also explicitly specialize a single member of an implicitly instantiated class.

```cpp
template<class T> struct Hash { static int of(const T&) { return 0; } };

template<> struct Hash<bool> {                 // an unrelated class with its own members
  static int of(bool b) { return b ? 1 : 0; }
};
template<> int Hash<char>::of(const char& c) { return c; }  // just one member
```

The ordering rule is strict. An explicit specialization must be declared before the first use that would cause an implicit instantiation, in every translation unit where such a use occurs. Within one file, compilers catch the violation.

```cpp
template<class T> struct Traits { static constexpr int id = 0; };
int f() { return Traits<int>::id; }    // implicitly instantiates Traits<int>
// template<> struct Traits<int> { static constexpr int id = 1; };
// error: specialization of 'Traits<int>' after instantiation
```

Across translation units nobody catches it. If one file sees the specialization and another file instantiates the primary template for the same arguments, the program is ill-formed with no diagnostic required, and the linker typically keeps whichever definition it sees first. Declare specializations in the same header as the primary template, or in a header that every user must include.

## Partial specialization of class and variable templates

A partial specialization keeps some parameters and constrains the shape of the arguments. Only class templates and, since C++14, variable templates can be partially specialized. When a specialization is needed, the compiler matches the arguments against every partial specialization; if one matches, the most specialized of the matching ones is used, and if none matches, the primary template is used. The ranking itself is covered in the topic on partial ordering of templates.

```cpp
template<class T, class U> struct Pair        { static constexpr int k = 0; };
template<class T>          struct Pair<T, T>  { static constexpr int k = 1; };
template<class T, class U> struct Pair<T*, U> { static constexpr int k = 2; };

static_assert(Pair<int, long>::k == 0);
static_assert(Pair<int, int>::k == 1);
static_assert(Pair<int*, long>::k == 2);
// Pair<int*, int*>::k: error, both partial specializations match equally well

template<class T> constexpr bool is_ptr = false;
template<class T> constexpr bool is_ptr<T*> = true;
template<class T> constexpr bool is_ptr<T* const> = true;  // top-level const is part of the type
static_assert(is_ptr<int* const>);
```

A partial specialization must be more specialized than the primary template, cannot have default template arguments, and, like an explicit specialization, must be declared before the use that would select it. Matching is exact on types: `int* const` does not match `T*`, which is why the standard traits strip cv-qualifiers first.

## Function templates: overload instead

A function template cannot be partially specialized at all. Writing `template<class T> void f<T*>(T*);` is an error. The language already has a tool for that job, overloading, and two overloaded templates followed by partial ordering cover every case partial specialization would.

Explicit specialization of a function template is allowed, but it is not an overload. Overload resolution considers only the primary templates and ordinary functions. Once a primary template wins, its explicit specialization, if one exists for the deduced arguments, supplies the body. Which primary template a specialization belongs to is decided at the point where you declare it, by the templates visible there. Peter Dimov and Dave Abrahams made this famous with two programs that differ only in the order of declarations.

```cpp
#include <cstdio>

template<class T> void f(T)    { std::puts("f(T)"); }     // (a)
template<class T> void f(T*)   { std::puts("f(T*)"); }    // (b)
template<>        void f(int*) { std::puts("f<int*>"); }  // specializes (b), the better match

template<class T> void g(T)    { std::puts("g(T)"); }     // (a)
template<>        void g(int*) { std::puts("g<int*>"); }  // only (a) exists yet: specializes it
template<class T> void g(T*)   { std::puts("g(T*)"); }    // (b)

int main() {
  int* p = nullptr;
  f(p);  // (b) wins overload resolution, its specialization runs: prints f<int*>
  g(p);  // (b) wins again, but the specialization belongs to (a): prints g(T*)
}
```

The cure is to stop specializing function templates. Write an ordinary non-template overload, which takes part in overload resolution and beats a template on an exact match. If you need partial-specialization behaviour, have the function template forward to a static member of a class template and partially specialize the class.

> **Pitfall.** Specializing a standard library function template in namespace `std` is undefined behavior since C++20. Customization goes through overloads found by argument-dependent lookup, or through specializing class templates such as `std::hash`.

## What to remember

- Each set of template arguments names a specialization; it is either instantiated from the template or written by hand.
- Implicitly instantiating a class instantiates member declarations only; bodies, default arguments and static data members wait until used.
- A function template specialization also has a point of instantiation at the end of the file, and meaning that differs between points is ill-formed, no diagnostic required.
- `template struct X<int>;` instantiates every defined member; `extern template` suppresses implicit instantiation of non-inline definitions and needs a definition somewhere.
- An explicit specialization must be declared before the first use that would instantiate it, in every translation unit, or the program is ill-formed with no diagnostic required.
- Only class and variable templates can be partially specialized; the most specialized matching one wins.
- Function template specializations never take part in overload resolution; they attach to the primary visible where they are declared. Overload instead.
