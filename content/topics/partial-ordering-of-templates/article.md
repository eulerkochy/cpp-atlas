---
title: "Partial ordering of templates"
summary: "When several function templates or class template partial specializations match equally well, the compiler picks the most specialized one by deducing each template against a synthesized instance of the other. Constraints, forwarding references, packs and C++20 rewritten operators each add a rule on top, and some pairs stay ambiguous no matter what."
track: "templates"
minutes: 13
standard:
  - "[temp.func.order]"
  - "[temp.deduct.partial]"
  - "[temp.spec.partial.order]"
  - "[temp.spec.partial.general]"
  - "[over.match.best.general]"
  - "[over.ics.rank]"
  - "[temp.constr.order]"
  - "[over.match.oper]"
  - "[temp.expl.spec]"
cppreference:
  - title: "Function template (partial ordering)"
    path: "language/function_template"
  - title: "Partial template specialization"
    path: "language/partial_specialization"
  - title: "Overload resolution"
    path: "language/overload_resolution"
  - title: "Constraints and concepts"
    path: "language/constraints"
prerequisites:
  - "template-argument-deduction"
  - "overload-resolution"
  - "concepts-and-constraints"
  - "template-instantiation-and-specialization"
---

## The one idea

Overload resolution first compares conversion sequences. Partial ordering only runs when two candidates are function template specializations that convert every argument equally well. It then asks a question about the templates themselves, not about the call: which one accepts a strict subset of what the other accepts?

The compiler answers that question mechanically. It invents a unique type for each template parameter of one template, substitutes them in, and tries to deduce the other template from the result. If `f(T*)` with an invented `U1` gives `f(U1*)`, the template `f(T)` can be deduced from it, with `T = U1*`. In the other direction `f(T*)` cannot be deduced from `f(U1)`. So every argument list `f(T*)` accepts is also accepted by `f(T)`, but not the other way round, and `f(T*)` is more specialized.

> **Mental model.** "More specialized" means "its patterns are an instance of the other's". Pretend to call each template with the other's most general argument types; the one that cannot swallow the other's is the winner.

## Where ordering sits in overload resolution

[over.match.best.general] lists the tie-breakers in order. A viable function is better than another if it has a better conversion sequence for some argument and no worse one for any other. Only when the conversions are equal do these apply, in this order: a non-template beats a template specialization; then the specialization of the more specialized template wins; then, for non-template functions with the same parameter types, the more constrained one wins; and later still, a non-rewritten candidate beats a rewritten one, and a non-reversed one beats a reversed one.

That order explains the classic surprises. A template with an exact match beats a non-template that needs a promotion, because conversions are compared first.

```cpp
#include <cstdio>

void f(int) { std::puts("non-template"); }
template<class T> void f(T) { std::puts("template"); }

int main() {
  f(1);    // non-template: equal conversions, non-template wins the tie
  f('a');  // template: T = char is an exact match, int needs a promotion
}
```

## The deduction procedure

[temp.deduct.partial] fixes which types take part. In a call, only parameters for which the call has explicit arguments are used, so default arguments and unmatched trailing packs do not count. For taking the address of a function template the whole function type is used, and for conversion function templates the return types are used.

Before deducing, references are stripped from both sides and then top-level cv-qualifiers, with one record kept: if both sides were references, the compiler remembers which was an lvalue reference and which was more cv-qualified, for a tie-break described below. Each template is then deduced against the other's synthesized parameter types. A template is at least as specialized as another if deduction succeeds for every considered type; it is more specialized if, in addition, the reverse fails for at least one.

```cpp
#include <cstdio>

template<class T> void b(T)        { std::puts("b(T)"); }
template<class T> void b(T*)       { std::puts("b(T*)"); }
template<class T> void b(const T*) { std::puts("b(const T*)"); }

int main() {
  int i = 0; const int ci = 0;
  b(&i);   // b(T*): b(const T*) needs a qualification conversion and loses
           // on conversions; b(T*) beats b(T) by partial ordering
  b(&ci);  // b(const T*): all three are exact, and it is the most specialized
}
```

Ordering is pairwise, and the winner must be more specialized than every other candidate. When neither of a pair is more specialized, and nothing earlier separated them, the call is ambiguous. Templates that each specialize a different parameter are the textbook case.

```cpp
template<class T> void g(T, int*) {}
template<class T> void g(int*, T) {}

void use(int* p) {
  // g(p, p);  // error: ambiguous; each template is more specialized in one position
  (void)p;
}
```

An explicit specialization is not a candidate in any of this. It is attached to whichever primary template partial ordering selected at the point where the specialization was declared, and it is used only if overload resolution picks that template.

```cpp
#include <cstdio>

template<class T> void h(T)       { std::puts("h(T)"); }
template<> void h<>(int*)         { std::puts("h(T) specialized for int*"); }
template<class T> void h(T*)      { std::puts("h(T*)"); }

int main() { int i = 0; h(&i); }  // prints h(T*): the specialization belongs to h(T)
```

## References, forwarding references and packs

When deduction succeeds in both directions and both original types were references, [temp.deduct.partial] adds two tie-breaks. A parameter whose argument side was an lvalue reference is more specialized than one that was an rvalue reference, and the more cv-qualified reference is more specialized. This is why `f(T&)` beats `f(T&&)` for an lvalue, and `f(const T&)` beats `f(T&&)` for a const lvalue.

It does not mean `const T&` beats a forwarding reference in general. For a non-const lvalue, `f(T&&)` deduces `T = int&` and binds `int&`, which [over.ics.rank] prefers to binding `const int&`. The conversion comparison decides, and partial ordering never runs. The topic on forwarding references covers why this makes forwarding constructors hijack copy construction.

```cpp
#include <cstdio>

template<class T> void c(T&)       { std::puts("c(T&)"); }
template<class T> void c(T&&)      { std::puts("c(T&&)"); }
template<class T> void d(const T&) { std::puts("d(const T&)"); }
template<class T> void d(T&&)      { std::puts("d(T&&)"); }

int main() {
  int i = 0; const int ci = 0;
  c(i);    // c(T&): lvalue-reference tie-break
  d(ci);   // d(const T&): both bind const int&, ordering prefers it
  d(i);    // d(T&&): binding int& is a better conversion than const int&
}
```

Packs are handled by the same deduction. `f(T)` is more specialized than `f(Ts...)`, because `Ts...` can be deduced from `U1` but `T` cannot be deduced from a pack expansion. There is one extra rule: if the two templates tie and one has a trailing parameter pack while the other has no parameter in that position, the one without the pack wins. That makes `f(T)` beat `f(T, Ts...)` for a single argument, a resolution of CWG 1395 that GCC and Clang both implement.

```cpp
#include <cstdio>

template<class T> void e(T)                 { std::puts("e(T)"); }
template<class T, class... Ts> void e(T, Ts...) { std::puts("e(T, Ts...)"); }

int main() {
  e(1);     // e(T): the empty pack loses the tie
  e(1, 2);  // e(T, Ts...): the only viable candidate
}
```

> **Pitfall.** Ordering only considers the parameters the call supplies. `template<class T> void f(T, int = 0)` and `template<class T> void f(T*)` called with one pointer argument are compared on their first parameters alone, so `f(T*)` wins even though the two signatures look incomparable.

## Constraints as the last word

C++20 adds constraints to the picture, though the subject of how constraints subsume each other belongs to the concepts topic. [temp.func.order] says that when deduction succeeds in both directions, and the two templates have equivalent template parameter lists and the same function parameter types after substitution, the more constrained one is more specialized.

The precondition is easy to miss. Constraints only break ties between templates that are otherwise the same shape. Change the parameter from `T` to `const T&` in one of them and the constraint is never consulted.

```cpp
#include <concepts>

template<std::integral T> void k(T) {}
template<class T> void k(T) {}          // same shape: the constrained one wins

template<std::integral T> void m(T) {}
template<class T> void m(const T&) {}   // different parameter types

void use() {
  k(1);       // OK: calls the std::integral overload
  // m(1);    // error: ambiguous; the constraint is not considered
}
```

Subsumption works only through concepts. Two `requires std::is_integral_v<T>` clauses written in different declarations are different atomic constraints, so adding `&& std::is_signed_v<T>` to one of them does not make it more constrained, and the call is ambiguous. The same comparison of constraints also breaks ties between non-template member functions of a class template, such as `void f() requires std::integral<T>` beside a plain `void f()`.

## Ordering class template partial specializations

[temp.spec.partial.order] reuses the function machinery. Each partial specialization is rewritten as a function template with the same template parameters and one function parameter whose type is the specialization's argument list, such as `void p(S<T*>)`. The partial specialization whose function is more specialized wins. If no partial specialization matches, the primary template is used.

The rewriting means the same ambiguities apply. `S<T, int>` and `S<int, T>` both match `S<int, int>`, neither is more specialized, and using `S<int, int>` is ill-formed, while `S<int, long>` and `S<long, int>` are fine. [temp.spec.partial.general] also requires every partial specialization to be more specialized than the primary template; a "specialization" that merely restates the primary's parameters, or that is less constrained, is an error.

```cpp
template<class T, class U> struct S { static constexpr int v = 0; };
template<class T> struct S<T, int> { static constexpr int v = 1; };
template<class T> struct S<int, T> { static constexpr int v = 2; };
template<class T> struct S<T*, T*> { static constexpr int v = 3; };

static_assert(S<long, int>::v == 1 && S<int, long>::v == 2);
static_assert(S<char*, char*>::v == 3);
// S<int, int>::v;  // error: ambiguous partial specializations
```

## Reversed and rewritten operator candidates

C++20 makes `a == b` also consider `b == a`, and `a < b` consider `(a <=> b) < 0` and `0 < (b <=> a)`. The rewritten and reversed candidates join ordinary overload resolution, and the tie-breaks prefer the ordinary candidate only after everything else, including the template rules, has failed to separate them. When a reversed candidate is a template, [temp.func.order] reverses its parameter order before partial ordering.

The ordering of tie-breakers has a visible effect. A non-template beats a template before rewriting is considered, so a reversed non-template candidate beats a non-reversed template.

```cpp
#include <cstdio>

struct X {}; struct Y {};
template<class T, class U> bool operator==(const T&, const U&) {
  std::puts("generic"); return true;
}
bool operator==(const Y&, const X&) { std::puts("Y == X"); return true; }

int main() { X x; Y y; (void)(x == y); }  // prints Y == X, via the reversed candidate
```

> **Standardese.** By the letter of [over.match.best.general], a member `bool operator==(const S&)` that is not `const` makes `s1 == s2` ambiguous with its own reversed form, because each candidate binds one operand better. GCC and Clang accept it with a warning and pick the non-reversed candidate. Declare comparison members `const` and the question never arises.

## What to remember

- Partial ordering runs only after conversion sequences tie, and it compares templates, not calls.
- A non-template beats a template specialization on a tie, but a template with a better conversion beats a non-template.
- The procedure synthesizes unique types for one template and deduces the other from them, in both directions.
- In a call, only parameters with explicit arguments take part; default arguments and empty packs do not.
- Explicit specializations never compete; they belong to the primary template chosen where they were declared.
- `T&` beats `T&&` for lvalues and `const T&` beats `T&&` for const lvalues, but for a non-const lvalue `T&&` wins on conversions.
- Constraints only order templates with equivalent template parameters and parameter types, and subsumption needs named concepts.
- Class partial specializations are ordered by rewriting them as function templates; ambiguity makes the use ill-formed.
- Rewritten and reversed operator candidates lose ties only after the template tie-breakers, so a reversed non-template can beat a template.
