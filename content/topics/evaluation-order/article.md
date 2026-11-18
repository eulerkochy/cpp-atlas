---
title: "Evaluation Order, Sequencing & Undefined Side Effects"
summary: "Separate operator precedence from evaluation order, read C++17's tightened sequencing guarantees, and avoid unsequenced undefined behavior."
track: "expressions-and-functions"
minutes: 7
standard:
  - "[intro.execution]"
  - "[expr.call]"
  - "[expr.ass]"
  - "[expr.log.and]"
  - "[expr.cond]"
  - "[expr.comma]"
cppreference:
  - title: "Order of evaluation"
    path: "language/eval_order"
  - title: "Operator Precedence"
    path: "language/operator_precedence"
  - title: "Increment/decrement operators"
    path: "language/operator_incdec"
  - title: "Logical operators"
    path: "language/operator_logical"
prerequisites:
  - "value-categories"
---

Many C++ bugs start with a simple confusion: reading an expression's operator precedence as if it were a runtime schedule. When you write `f() + g() * h()`, operator precedence forces `*` to bind tighter than `+`, grouping the expression as `f() + (g() * h())`. Precedence builds the syntax tree, not the execution timeline. The compiler is completely free to evaluate `f()` before `g()`, after `h()`, or between them, because `+` and `*` impose no ordering constraint between their subexpressions.

> **Mental model.** Precedence and associativity decide *which operands belong to which operator*; sequencing decides *when side effects and value computations happen in time*. Two expressions can share the exact same parse tree on every compiler while running their leaf calls in opposite orders under different optimization flags.

## Sequenced-before, unsequenced, and indeterminately sequenced

To talk precisely about time inside a single thread, the C++ standard defines every evaluation as two steps: **value computation** (producing the result) and **initiation of side effects** (modifying an object, reading a `volatile` glvalue, or invoking I/O). Between any two evaluations `A` and `B`, `[intro.execution]` defines exactly three possible ordering relationships:

1. **Sequenced before.** Both the value computation and every side effect of `A` finish completely before `B` begins. Semicolons (`;`), full-expression boundaries, and specific operators establish this strict edge.
2. **Indeterminately sequenced.** Either `A` is sequenced before `B`, or `B` is sequenced before `A`, and the compiler does not have to tell you which—even across different call sites in the same binary. Crucially, `A` and `B` **cannot overlap** or interleave instructions.
3. **Unsequenced.** `A` and `B` may execute in any order and may interleave step-by-step on the abstract machine.

That third category is where undefined behavior lives. Under `[intro.execution]/10`, if a side effect on a scalar object is **unsequenced** relative to either a different side effect on the same scalar object or a value computation using the value of that same scalar object, the behavior is **undefined**—not unspecified, not implementation-defined, completely undefined.

> **Standardese.** "If a side effect on a memory location is unsequenced relative to either another side effect on the same memory location or a value computation using the value of any object in the same memory location, and they are not potentially concurrent, the behavior is undefined." — `[intro.execution]`

```cpp
int f();
int g();
int h();

void demo(int i) {
    // Parse tree is f() + (g() * h()), yet f(), g(), and h()
    // are indeterminately sequenced relative to one another.
    int total = f() + g() * h();

    // Undefined behavior: two unsequenced mutations/reads of scalar 'i'.
    // int bad = i++ + ++i;
    // int also_bad = i + i++;
    (void)total;
    (void)i;
}
```

## What C++17 guaranteed—and what it did not

Before C++17, idioms as ordinary as `std::cout << a() << b()` or `map[key] = build()` carried subtle traps because almost every binary operator left its operands unsequenced. C++17 (via P0145R3) tightened the abstract machine so postfix chains, shifts, and assignments have predictable order, while intentionally leaving arithmetic and comparison operators unsequenced so optimizers can keep scheduling registers freely.

| Expression form | Sequencing rule since C++17 | Notes |
| --- | --- | --- |
| `a.b`, `a->b`, `a->*b`, `a.*b` | `a` before `b` | Member access proceeds left-to-right |
| `a[b]` | `a` before `b` | Applies to built-in and overloaded `operator[]` |
| `a << b`, `a >> b` | `a` before `b` | Stream chaining `cout << f() << g()` calls `f()` first |
| `a = b`, `a @= b` | `b` before `a` | Right operand completes before left operand |
| `a(b1, b2, ...)` | `a` before all `bi`; `bi` indeterminately sequenced | Arguments cannot interleave each other |
| `{e1, e2, ...}` | `e1` before `e2` before `...` | Braced-init-lists evaluate strictly left-to-right |
| `a + b`, `a * b`, `a < b` | Unsequenced (function calls indeterminately sequenced) | Never mutate and read the same scalar across sides |

Look closely at the assignment row in that summary. Both built-in assignments and operator-syntax assignments (`a = b`, `a += b`) evaluate their **right-hand operand completely before their left-hand operand** (`[expr.ass]/1` combined with `[over.match.oper]/2`). Even in `v[i] = i++;`, C++17 sequences `i++` (computing `0` and incrementing `i` to `1`) before evaluating `v[i]`, storing `0` into `v[1]`. That was undefined behavior in C++14; it is well-defined in C++17 and later, though still hostile to human readers and worth splitting into two clear statements.

```cpp
#include <iostream>

struct Sink {
    Sink& operator=(const Sink&) { return *this; }
};

Sink& pick_target(Sink& s) {
    std::cout << "lhs ";
    return s;
}

Sink build_value() {
    std::cout << "rhs ";
    return Sink{};
}

int step(const char* tag, int value) {
    std::cout << tag << ' ';
    return value;
}

void sequencing_demo() {
    Sink target;
    pick_target(target) = build_value(); // Prints: rhs lhs

    std::cout << step("first", 1) << step("second", 2) << '\n'; // Prints: first 1second 2

    int ordered[] = { step("one", 1), step("two", 2), step("three", 3) };
    (void)ordered;
}
```

## Function arguments and the smart-pointer classic

Function-call syntax `f(a1, a2, ...)` obeys two distinct rules. First, the postfix expression `f` itself—which might compute a function pointer or callable object—is sequenced before every argument expression and before every default argument (`[expr.call]/7`). Second, the argument expressions `a1`, `a2`, and so on are **indeterminately sequenced** relative to one another, rather than unsequenced.

That distinction solved a notorious pre-C++17 memory leak:

```cpp
#include <memory>

struct Widget { explicit Widget(int) {} };
int compute_or_throw();
void consume(std::shared_ptr<Widget>, int);

void call_site() {
    // Pre-C++17: compiler could run (1) new Widget{1}, (2) compute_or_throw(),
    // and only then (3) shared_ptr ctor — leaking Widget if step 2 threw!
    // C++17+: argument 1 and argument 2 cannot interleave, closing the leak.
    consume(std::shared_ptr<Widget>(new Widget{1}), compute_or_throw());

    // Still cleaner and avoids a separate control-block allocation:
    consume(std::make_shared<Widget>(1), compute_or_throw());
}
```

Notice what C++17 did *not* change: `compute_or_throw()` is still allowed to run before `new Widget{1}`, or after `std::shared_ptr<Widget>(new Widget{1})` finishes constructing. Only interleaving the steps inside one argument with the steps of another argument was outlawed. Also remember that parameter initialization completes for every argument before the function body begins executing, and parameter destruction order at the end of the call is implementation-defined (though commonly right-to-left on the Itanium ABI and left-to-right on MSVC).

## Short-circuiting, commas, and overloaded operators

Four built-in operators enforce strict left-to-right control flow: logical AND (`a && b`), logical OR (`a || b`), the ternary conditional (`a ? b : c`), and the comma operator (`a, b`). For built-in `&&` and `||`, `a` is sequenced before `b`, and `b` is never evaluated at all if `a` settles the boolean outcome. Similarly, `a ? b : c` completes `a` and all of its side effects before starting whichever single branch (`b` or `c`) is selected. Built-in `a, b` evaluates `a`, discards its result, and sequences `a` before `b`.

> **Pitfall.** Overloading `operator&&`, `operator||`, or `operator,` breaks short-circuiting. While C++17 preserves left-before-right operand sequencing in `[over.match.oper]/2`, user-defined `operator&&` is still a function call whose parameters must both be initialized before entry—so the right-hand operand always evaluates, even when the left-hand operand is logically false.

Finally, keep the **comma operator** separate from **comma separators**. The commas inside `foo(a(), b())` separate function arguments and leave their order unspecified (indeterminately sequenced). The commas inside `{a(), b()}` separate braced-initializer clauses, which *are* guaranteed left-to-right (`[dcl.init.list]/4`). Only `(a(), b())`—wrapped in parentheses as a single expression—invokes the comma operator itself.

## What to remember

- **Precedence is syntax, sequencing is time.** Operators like `+` and `*` bind operands into a tree without ordering their subexpressions.
- **Unsequenced scalar conflicts are UB.** Never read or write a scalar object more than once across unsequenced subexpressions such as `i++ + ++i`.
- **C++17 fixed chains, shifts, and assignments.** Left-to-right holds for `.`, `->`, `[]`, `<<`, `>>`, and `{...}`, while `=` and `@=` evaluate right-before-left.
- **Function arguments still have no fixed order.** Arguments cannot interleave after C++17, yet any argument may still finish before its siblings start.
- **Never overload `&&`, `||`, or `,`.** Custom overloads evaluate both operands eagerly and defeat the short-circuit contract readers expect.
