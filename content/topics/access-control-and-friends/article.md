---
title: "Access control and friends"
summary: "Access control decides whether a name may be used, never which entity a name means. It is checked after lookup and overload resolution, it follows the static type, and friendship grants it one class or function at a time."
track: "classes"
minutes: 12
standard:
  - "[class.access]"
  - "[class.access.general]"
  - "[class.access.spec]"
  - "[class.access.base]"
  - "[class.friend]"
  - "[class.protected]"
  - "[class.access.virt]"
  - "[class.access.nest]"
  - "[class.local]"
  - "[over.match.general]"
  - "[basic.lookup.argdep]"
  - "[temp.deduct.general]"
  - "[temp.spec.general]"
cppreference:
  - title: "Access specifiers"
    path: "language/access"
  - title: "Friend declaration"
    path: "language/friend"
  - title: "Derived classes"
    path: "language/derived_class"
  - title: "Nested classes"
    path: "language/nested_classes"
  - title: "Injected-class-name"
    path: "language/injected-class-name"
prerequisites:
  - "member-functions-and-this"
  - "inheritance-and-virtual-functions"
  - "name-lookup-and-adl"
---

## The one idea

Access control is a filter applied to **names**, at the very end. The compiler first finds what a name refers to, then picks an overload, and only then asks whether the place that used the name is allowed to use it. If not, the program is ill-formed. Access never makes the compiler look elsewhere or choose a different function.

Three consequences follow, and most surprises in this area are one of them. A private member still hides outer names and still wins overload resolution. Access follows the static type and the name you wrote, not the object you have. And anything that does not spell the name, such as `auto` holding a value of a private nested type, is not checked at all.

> **Mental model.** Lookup decides *what*, overload resolution decides *which*, and access decides only *whether you may say it here*. Access is a permission on a spelling, not a property of the object.

## Access is checked last

A class member is `public`, `protected`, or `private`. Members of a `class` default to private and members of a `struct` or `union` default to public; that default, together with the default access of base classes, is the only difference between `class` and `struct`. Because access comes after overload resolution, a private overload that is the best match is an error, even when a worse public overload would have worked.

```cpp
struct S {
  void f(int);
private:
  void f(double);
};

void g(S& s) {
  // s.f(1.0);  // ill-formed: f(double) is chosen, then found private
  s.f(1);       // OK: f(int) is the best match and is public
}
```

Lookup ignores access too. A private member in a base class hides a global of the same name, so the derived class gets an access error instead of the global.

```cpp
int x;
class B { int x; };
struct D : B {
  void f() { ::x = 1; }  // must qualify: plain x finds B::x, which is private
};
```

Access applies to names, not to types or objects. A function may return a private nested type, and a caller can hold the result with `auto` and use its public members, because the private name is never spelled. Virtual functions follow the same rule: [class.access.virt] says access is checked on the expression used for the call, using the naming class of the static type. A public virtual in the base may be overridden by a private function in the derived class, and a call through a base reference reaches it.

```cpp
#include <cstdio>
struct B { virtual void f() { std::puts("B"); } };
class D : public B { void f() override { std::puts("D"); } };

void call(D& d) {
  B& b = d;
  b.f();    // OK, prints D: access checked on B::f
  // d.f(); // ill-formed: D::f is private
}
```

> **Standardese.** [over.match.general] defines a usable candidate as one that is selected by overload resolution and is accessible from the context of the use. Accessibility is checked on the winner; it does not remove inaccessible functions from the candidate set.

## Protected: access through your own type

`protected` is the one specifier with an extra rule. A member function or friend of `Derived` may use a protected non-static member of `Base`, but only through an object expression whose type is `Derived` or a class derived from `Derived`. It may not reach into an arbitrary `Base`, or into a sibling class that also derives from `Base`.

```cpp
struct Base { protected: int x = 0; };

struct Derived : Base {
  int ok(Derived& d) { return d.x; }   // OK: through Derived
  // int bad(Base& b) { return b.x; }  // ill-formed: through Base
  // auto p() { return &Base::x; }     // ill-formed: must name Derived
  auto q() { return &Derived::x; }     // OK, and its type is int Base::*
};
```

The reasoning is that protected members belong to the derived class's own share of the object. Without the rule, any class could derive from `Base` and then read the protected state of every other `Base` it was handed. The rule applies only to non-static members; a protected static member has no object to check and is accessible by name.

> **Standardese.** [class.protected] adds a check beyond the ordinary ones when a non-static member is protected in its naming class: the access must be through a pointer to, reference to, or object of the accessing class or a class derived from it, and forming a pointer to member must name that class.

## Friends

A friend declaration inside a class grants a function or class the same access the class's own members have. It can name a function, a member function of another class, a whole class, or a template.

```cpp
template<class T> class Box {
  T v{};
  template<class U> friend class Box;                     // every Box is a friend
  template<class U> friend U unwrap(const Box<U>&);       // every unwrap is a friend
public:
  template<class U> bool same(const Box<U>& o) const { return v == o.v; }
};
template<class U> U unwrap(const Box<U>& b) { return b.v; }
```

Friendship is granted, never inferred. It is **not inherited**: a class derived from a friend gets nothing. It is **not transitive**: a friend of a friend gets nothing. And it is **not reciprocal**: declaring `B` a friend of `A` gives `A` no access to `B`. What a friend does get is access through derived objects. A friend of `Base` may use `Base`'s private members when it names them through a `Derived` object, because the `Base` subobject is still accessed as a member of `Base`.

```cpp
class A { int secret = 1; friend class B; };
class B { public: int f(A& a) { return a.secret; } };  // OK
class C : public B {
  // int g(A& a) { return a.secret; }  // ill-formed: friendship is not inherited
};
```

### Hidden friends

A friend function that is first declared, and usually defined, inside the class is a member of the enclosing namespace, but ordinary lookup cannot find it. Only argument-dependent lookup finds it, when one of the arguments has the class as an associated class. This is the **hidden friend** idiom, and it is the preferred way to write operators and customization functions such as `swap`.

```cpp
namespace n {
struct V {
  int v;
  friend bool operator==(V a, V b) { return a.v == b.v; }
  friend void show(V) {}
};
}

void use(n::V a) {
  show(a);       // OK: found by ADL
  // n::show(a); // ill-formed: qualified lookup does not find a hidden friend
}
```

Hidden friends keep overload sets small. The operator is not a candidate for unrelated types, so it cannot be picked through an implicit conversion of some other argument, and diagnostics do not list it. [basic.lookup.argdep] is the rule that makes such a friend visible through its class.

## Access to bases and inherited names

A base class has an access too. With `public` inheritance, inherited members keep their access. With `protected`, public members become protected in the derived class. With `private`, they become private. A `class` inherits privately by default, a `struct` publicly. Base access also governs the conversion from `Derived*` to `Base*`: outside the class and its friends, converting to a private base is ill-formed, which is what makes private inheritance mean "implemented in terms of" rather than "is a".

A `using`-declaration can restore or change the access of an inherited member, provided the `using` itself can see it.

```cpp
struct B { protected: int x = 5; void f() {} };
struct D : B { using B::x; using B::f; };   // both now public in D
```

> **Pitfall.** A class name is also injected into its own scope as a member. If `B` inherits privately from `A`, then inside a class `C` derived from `B`, the plain name `A` finds the injected-class-name through `B`, which is private, and `A a;` is ill-formed. Writing `::A` finds the namespace-scope name and works.

## Templates, SFINAE and explicit instantiation

Access checking in templates uses the context of the template, as for any other code. Since C++11, access checking is also part of template argument substitution, as [temp.deduct.general] states. An expression that names an inaccessible member is a substitution failure, so detection idioms and concepts report "no such member" rather than producing a hard error.

```cpp
#include <type_traits>
#include <utility>

class P { void f(); public: void g(); };

template<class T, class = void> struct has_f : std::false_type {};
template<class T>
struct has_f<T, std::void_t<decltype(std::declval<T&>().f())>> : std::true_type {};

static_assert(!has_f<P>::value);                        // private f is "absent"
template<class T> concept HasF = requires(T t) { t.f(); };
static_assert(!HasF<P>);
```

There is one deliberate hole. [temp.spec.general] says the usual access checking rules do not apply to names in the declaration of an explicit instantiation or explicit specialization, outside function bodies and a few other places. Explicit instantiations have always had this exemption; C++20 extended it to explicit specializations and to the template arguments of partial specializations. That is why `template struct Thief<&Vault::gold>;` may name a private member in a template argument, a trick used by testing and serialization libraries.

## Nested and local classes

A nested class is a member of its enclosing class, so since C++11 it has the same access as any other member: it may use every private name of the enclosing class. The reverse does not hold. The enclosing class has no special access to the nested class's private members.

```cpp
class Outer {
  int x = 0;
  class Inner {
    int y = 0;
  public:
    int get(Outer& o) { return o.x; }   // OK: Inner is a member of Outer
  };
  // int peek(Inner& i) { return i.y; } // ill-formed: Outer is not Inner's friend
};
```

A local class, one defined inside a function body, may use the names that its enclosing function may use, as [class.access.general] states. Inside a member function, that includes the private members of the function's class. Friend declarations follow the same scoping: a friend declared in a nested class is a friend of that nested class only.

## What to remember

- Access is checked after lookup and overload resolution; a private best match is an error, not a reason to pick another function.
- Private members still hide outer names; qualify the outer name to reach it.
- Access is on names: `auto` can hold a private nested type, and virtual calls check the static type.
- Protected non-static members are reachable only through the accessing class or classes derived from it, including when forming `&Derived::m`.
- Friendship is not inherited, transitive or reciprocal.
- Hidden friends are found only by ADL, which keeps operators out of unrelated overload sets.
- Base access controls inherited member access and the derived-to-base conversion; `using` can change a member's access.
- Inaccessible members are substitution failures in SFINAE and concepts; explicit instantiations skip access checks.
- Nested classes see their enclosing class's private names, but not the other way round.
