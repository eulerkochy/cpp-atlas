---
title: "Contracts"
summary: "C++26 adds preconditions, postconditions and contract_assert. A contract assertion is a redundant check whose evaluation semantic, from ignore to quick-enforce, is chosen by the implementation rather than written in the code."
track: "cpp26"
minutes: 14
standard:
  - "[basic.contract.general]"
  - "[basic.contract.eval]"
  - "[basic.contract.handler]"
  - "[dcl.contract.func]"
  - "[dcl.contract.res]"
  - "[stmt.contract.assert]"
  - "[expr.prim.id.unqual]"
  - "[expr.call]"
  - "[support.contract]"
  - "[structure.specifications]"
cppreference:
  - title: "Contract assertions"
    path: "language/contracts"
  - title: "Function contract specifiers"
    path: "language/function#Function_contract_specifiers"
  - title: "contract_assert statement"
    path: "language/contract_assert"
  - title: "Standard library header <contracts>"
    path: "header/contracts"
  - title: "std::contracts::contract_violation"
    path: "contract/contract_violation"
  - title: "assert"
    path: "error/assert"
  - title: "C++ attribute: assume"
    path: "language/attributes/assume"
prerequisites: []
---

## The one idea

A contract assertion states something that a correct program already guarantees. It is a redundant check, not logic. The code says *what* should be true; how that check behaves, whether it is skipped, logged, or fatal, is decided by the implementation, usually through a build flag, and can even differ from one evaluation to the next.

This is C++26, specified by P2900R14 and adopted into the working draft in February 2025. Everything here follows N5050, the final C++26 draft that went to the international ballot. That ballot closed in October 2026 and was reported as not approved, with contracts at the centre of the dispute, so check the status before you quote it as published ISO C++. Compiler support is experimental: GCC 16 needs `-std=c++26 -fcontracts`, and it differs from the draft in a few places noted below.

> **Mental model.** Write each predicate so that deleting it, checking it, or checking it twice would leave a correct program unchanged. Every rule in this feature follows from protecting that property.

## Three kinds of assertion

A **precondition** is written `pre(expr)` after the declarator. It is checked after the arguments have initialized the parameters and before the function body runs. A **postcondition** is written `post(expr)` or `post(r: expr)`. It is checked when the function returns normally, after local variables are destroyed and before the parameters are. `r` is a **result binding** that names the returned object. An **assertion statement** is written `contract_assert(expr);` and works like any other statement.

```cpp
#include <contracts>

int isqrt(const int x)
  pre(x >= 0)
  post(r: r * r <= x && (r + 1) * (r + 1) > x)
{
  int r = 0;
  while ((r + 1) * (r + 1) <= x) ++r;
  contract_assert(r >= 0);
  return r;
}
```

`contract_assert` is a full keyword. It was not named `assert` so that it would not clash with the `<cassert>` macro. `pre` and `post` are identifiers with special meaning, so `int pre = 0;` is still valid. You can write any number of `pre` and `post` specifiers in any order, and each kind is evaluated in the order it was written. A postcondition is never checked when the function exits by an exception or by `longjmp`.

## Where function contract specifiers go

Specifiers belong to a function's **first declaration**. A later declaration may leave them out or repeat the whole sequence, which must match the original under the ODR. It may not repeat only part of the sequence, and it may not add specifiers that the first declaration lacked. If two translation units each contain a first declaration and the sequences differ, the program is ill-formed, no diagnostic required.

The specifiers are not part of the function's type. Overload resolution ignores them, so two templates that differ only in their contracts are ambiguous. A pointer to function, a pointer to member function, or a function type alias cannot carry specifiers. A call through a pointer still checks the target's assertions, because they belong to the function rather than to the expression used to call it.

In C++26 these declarations may not have specifiers:

- a virtual function;
- a deleted function;
- a function defaulted on its first declaration. `T::T() = default;` written after `T();` in the class is not a first declaration, but it may not add specifiers either.

Contracts on virtual functions were adopted into the C++29 working draft (P3097R3) in June 2026. Under that design, a virtual call checks the statically chosen function's preconditions and then the final overrider's. None of that is in C++26.

Lambdas, constructors, destructors, `main`, and coroutines may all have contracts. A lambda's specifiers go in the lambda declarator and apply to its call operator. A name used only inside a contract assertion cannot trigger an implicit capture, so `[=] pre(i > 0) {}` is ill-formed unless `i` is captured explicitly or used elsewhere in the body. That rule keeps adding a check from changing a closure's layout. In a coroutine, a predicate may not contain `co_await` or `co_yield`, and a postcondition may not odr-use a non-reference parameter, because the coroutine works on mutable copies of its parameters.

## Predicates see a const world

Inside a predicate, an id-expression that names a variable declared outside the assertion has `const` type. This covers parameters, locals, globals, and anything reached through a reference. `this` becomes a pointer to const, and the result binding is a const lvalue. Rather than banning side effects, the language makes the common accidental mutations fail to compile.

```cpp
struct Buffer {
  int n = 0;
  int size() { return n; }               // forgot const
  int csize() const { return n; }
};

void use(Buffer& b) pre(b.csize() > 0);  // OK
// void bad(Buffer& b) pre(b.size() > 0);  // error: b is a const lvalue here
// void inc(int x) pre(++x > 0);           // error: x is const in the predicate
```

The const applies to the name, not to the object. A `mutable` member, a `const_cast`, or a function that modifies a global can still produce a side effect. That is legal, but it is a trap, as the next section shows.

> **Pitfall.** A postcondition that reads a by-value parameter needs that parameter to be declared `const` on every declaration, including declarations that do not mention the postcondition. Without that rule, the body could modify the parameter and the postcondition would check the wrong value. Arrays decay, so `const int a[10]` is `const int*`, not `const int* const`, and still does not qualify.

## Four evaluation semantics

Each evaluation of a contract assertion uses one of four semantics:

- **ignore**: the predicate is not evaluated. It is still odr-used, so it must compile, and templates in it are instantiated.
- **observe**: the predicate is checked. On a violation, the contract-violation handler runs, and if it returns, execution continues after the assertion.
- **enforce**: the predicate is checked. On a violation, the handler runs, and if it returns, the program is *contract-terminated*.
- **quick-enforce**: the predicate is checked. On a violation, the program is contract-terminated immediately, without calling the handler.

Observe, enforce, and quick-enforce are the checking semantics, and enforce and quick-enforce are the terminating ones. Contract termination means calling `std::terminate`, calling `std::abort`, or simply stopping execution, and the choice is implementation-defined. Which semantic applies is implementation-defined *for each evaluation*. The standard recommends that implementations offer an all-ignore mode and an all-enforce mode, with enforce as the default. GCC selects the semantic with `-fcontract-evaluation-semantic=ignore|observe|enforce|quick_enforce`, defaulting to enforce.

A violation happens when the predicate is false, when its evaluation exits via an exception, or, during constant evaluation, when it is not a core constant expression.

> **Standardese.** Under a checking semantic, "it is unspecified whether the predicate is evaluated" ([basic.contract.eval]). The implementation may determine the value another way, with no side effects. Consecutive assertions are "evaluated in sequence", and each may be repeated an implementation-defined number of times, as long as the first occurrences keep their order. So a side effect in a predicate may happen zero, one, or several times, even with enforce.

Checking does not make undefined behaviour inside the predicate safe. If the predicate overflows a signed integer, the compiler may assume that never happens and fold the check away. To stop undefined behaviour *after* a check from reaching back in time and removing the check, the standard places an **observable checkpoint** before each checking evaluation, and another after the handler returns.

## The contract-violation handler

On a violation under observe or enforce, the implementation calls `::handle_contract_violation(const std::contracts::contract_violation&)`. Whether you can replace it is implementation-defined, and `__cpp_lib_replaceable_contract_violation_handler` reports the answer. `<contracts>` is freestanding. The `contract_violation` object cannot be copied, and you cannot create one yourself. It provides these observers:

- `kind()`, which returns `assertion_kind::pre`, `post`, or `assert`;
- `semantic()`, which returns the `evaluation_semantic` used;
- `is_terminating()`;
- `detection_mode()`, which returns `predicate_false` or `evaluation_exception`;
- `comment()`, usually the text of the predicate;
- `location()`, the source location.

`invoke_default_contract_violation_handler(v)` hands the violation to the default handler.

```cpp
#include <contracts>
#include <cstdio>
#include <exception>

void handle_contract_violation(const std::contracts::contract_violation& v) {
  std::fprintf(stderr, "%s:%u: %s\n", v.location().file_name(),
               (unsigned)v.location().line(), v.comment());
  if (v.detection_mode() == std::contracts::detection_mode::evaluation_exception)
    std::fprintf(stderr, "  (the predicate threw)\n");
  std::contracts::invoke_default_contract_violation_handler(v);
}
```

When the predicate throws, the handler runs inside an active implicit handler for that exception, so `std::current_exception()` or `throw;` can reach it. P2900R14 also had an `evaluation_exception()` observer returning `exception_ptr`, but it is not in N5050.

The handler may throw an exception instead of returning. For a precondition or postcondition, the effect is as if the function body exited with that exception. A function-try-block cannot catch it, and in a `noexcept` function the result is `std::terminate`. For `contract_assert`, the exception propagates from the statement like any other throw.

> **Pitfall.** GCC 16 spells the observer `mode()` instead of `detection_mode()`. It reports `predicate_false` even when the predicate threw, although it does call the handler from inside the exception's handler. It also accepts some forms the draft forbids: specifiers on deleted functions, on functions defaulted on their first declaration, and on function pointer declarations, and coroutine postconditions that read parameters. Trust the draft.

## Constant evaluation

Contract assertions are evaluated during constant evaluation too, with a semantic the implementation chooses. A violation there makes the program ill-formed under a terminating semantic. Under observe it produces a diagnostic, and evaluation continues. There is no handler at compile time.

```cpp
constexpr int half(int x) pre(x % 2 == 0) { return x / 2; }

static_assert(half(4) == 2);
// constexpr int a = half(3);
// enforce: error; observe: warning, a == 1; ignore: accepted silently
```

To decide whether a variable is constant-initialized, the implementation pretends that every assertion uses ignore. A failing check therefore cannot quietly turn static initialization into dynamic initialization. If one inline function sees different semantics in different translation units, and a predicate's side effect changes a constant's value, the result is an ODR violation.

## Relation to assert, [[assume]] and the library

`assert` is a macro controlled by `NDEBUG`. It cannot appear on a declaration, and it has no handler. `contract_assert` is a language construct that `NDEBUG` does not affect. An unchecked contract assertion never licenses the optimizer to assume that its predicate holds. That job belongs to `[[assume(expr)]]`, which is the opposite tool: a false assumption is undefined behaviour, while a false contract is a reportable violation. An "assume" semantic was deliberately left out of C++26.

The C++20 contracts design, P0542, was removed in 2019 before it shipped. It used attributes such as `[[expects: x > 0]]`, `[[ensures r: r > 0]]`, and `[[assert: p]]`, with `default`, `audit`, and `axiom` levels, a global build level, and a continuation mode. Violating an unchecked contract was undefined behaviour, which let compilers assume it held. P2900 replaces all of that with plain syntax, no levels, and semantics chosen per evaluation.

C++26 also adds a **hardened implementation**, specified by P3471. In a hardened implementation, a *Hardened preconditions:* clause in the library is checked with a contract assertion that uses a terminating semantic. Examples are `vector::operator[]`, `span::front`, and `optional::operator*`. In a non-hardened implementation, violating one is still undefined behaviour. Whether an implementation is hardened is implementation-defined. GCC 16 defines none of the `__cpp_lib_hardened_*` macros, and its `_GLIBCXX_ASSERTIONS` checks do not go through the contracts machinery.

## What to remember

- `pre`, `post(r: ...)`, and `contract_assert` express redundant checks. A correct program behaves the same whether they are checked or not.
- Specifiers live on the first declaration, are not part of the function type, and in C++26 are banned on virtual, deleted, and first-declaration-defaulted functions.
- Inside a predicate, outside variables, `*this`, and the result binding are const. A postcondition that reads a by-value parameter needs that parameter `const` on every declaration.
- The semantic (ignore, observe, enforce, or quick-enforce) is implementation-defined for each evaluation. Enforce is the recommended default.
- A predicate may be evaluated zero, one, or several times, so keep side effects out of it.
- A throwing predicate is a violation. A throwing handler acts as if the function body threw, so a `noexcept` function terminates.
- During constant evaluation, a violation is an error under a terminating semantic and a diagnostic under observe.
- Contracts never feed the optimizer; `[[assume]]` does. Library hardening reuses the machinery with a terminating semantic.
- GCC 16 support is experimental and deviates in a few places: it names the observer `mode()` and accepts some ill-formed declarations.
