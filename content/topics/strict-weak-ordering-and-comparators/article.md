---
title: "Strict weak ordering and comparators"
summary: "Every sorting algorithm and ordered container assumes its comparator is a strict weak ordering, and a comparator that is not one gives undefined behavior rather than a merely odd order. Knowing the four laws, and the equivalence they define, explains which comparators are safe and why ordered lookup ignores operator==."
track: "algorithms-and-ranges"
minutes: 12
standard:
  - "[alg.sorting.general]"
  - "[concept.strictweakorder]"
  - "[associative.reqmts.general]"
  - "[sort]"
  - "[stable.sort]"
  - "[range.cmp]"
  - "[cmp.alg]"
  - "[res.on.functions]"
cppreference:
  - title: "C++ named requirements: Compare"
    path: "named_req/Compare"
  - title: "std::strict_weak_order"
    path: "concepts/strict_weak_order"
  - title: "std::sort"
    path: "algorithm/sort"
  - title: "std::stable_sort"
    path: "algorithm/stable_sort"
  - title: "std::ranges::less"
    path: "utility/functional/ranges/less"
  - title: "std::strong_order"
    path: "utility/compare/strong_order"
prerequisites:
  - "algorithms"
  - "three-way-comparison"
  - "associative-and-unordered-containers"
---

## The one idea

A comparator answers one question: must `a` come before `b`? Algorithms like `std::sort` and containers like `std::set` never ask whether two elements are equal. They infer it. If neither has to come before the other, the two are treated as interchangeable, or **equivalent**. Everything the library does with a comparator, from partitioning around a pivot to rejecting a duplicate key, relies on that inference being consistent.

A **strict weak ordering** is precisely the condition under which the inference is consistent. It sorts the values into groups of equivalent elements and lines the groups up in a total order. If your comparator does not have that shape, the library is not obliged to produce a wrong-but-valid order. It is allowed to do anything, and real implementations read past the end of the array.

> **Mental model.** A strict weak ordering is a ranking with ties. Equivalent elements share a rank, every rank is strictly before or after every other, and `comp(a, b)` means "a's rank is lower".

## The four laws

For a comparator `comp`, define `equiv(a, b)` as `!comp(a, b) && !comp(b, a)`. [alg.sorting.general] requires, and the `strict_weak_order` concept documents, that `comp` is:

1. **Irreflexive.** `comp(a, a)` is false. Nothing comes before itself.
2. **Asymmetric.** If `comp(a, b)` then not `comp(b, a)`. This follows from the other laws but is the one most often broken directly.
3. **Transitive.** If `comp(a, b)` and `comp(b, c)` then `comp(a, c)`.
4. **Transitive in incomparability.** If `equiv(a, b)` and `equiv(b, c)` then `equiv(a, c)`.

The fourth law is what makes it *weak* rather than *partial*. Under the first three alone, incomparable elements can sit in no consistent position: `a` might tie with `b`, `b` with `c`, yet `a` come strictly before `c`. Law four rules that out, so equivalence is a genuine equivalence relation and the classes it forms are totally ordered.

> **Standardese.** [alg.sorting.general] says that, for every algorithm other than the binary searches, `comp` shall induce a strict weak ordering on the values, and defines equivalence as `!comp(a, b) && !comp(b, a)`. The binary searches only need the range to be partitioned with respect to the value sought. Breaking a library requirement placed on a user-supplied function object is undefined behavior by [res.on.functions].

## Comparators that break the laws

The usual suspects each break a specific law.

**Using `<=` or `>=`** breaks irreflexivity. `comp(x, x)` is true, so equal elements each claim to come first. In libstdc++, `std::sort` uses an unguarded insertion step that trusts `comp(x, x)` to be false as a stopping condition. With enough equal elements it walks off the front of the buffer. The debug mode, `-D_GLIBCXX_DEBUG`, checks irreflexivity and aborts with a diagnostic instead.

```cpp
#include <algorithm>
#include <vector>

void bad(std::vector<int>& v) {
  std::sort(v.begin(), v.end(), [](int a, int b) { return a <= b; });
  // undefined behavior: comp(x, x) is true
}
```

**NaN** breaks transitivity of incomparability. With `<` on doubles, NaN is incomparable to every value, so `1.0` ties with NaN and NaN ties with `2.0`, yet `1.0 < 2.0`. One NaN in a `std::vector<double>` makes `std::sort` with the default comparator undefined behavior, and `std::set<double>` lookups unreliable.

**An inconsistent multi-key comparison** breaks asymmetry. The classic mistake reads like a reasonable rule.

```cpp
struct Pt { int x, y; };

bool wrong(const Pt& a, const Pt& b) {
  return a.x < b.x || a.y < b.y;
}
// wrong({1, 2}, {2, 1}) and wrong({2, 1}, {1, 2}) are both true
```

**State that changes between calls**, such as a comparator that consults a random number generator or a mutable cache keyed on call order, breaks all four at once. A comparator may count its calls, but its answer must depend only on the two arguments.

> **Pitfall.** Undefined behavior from a bad comparator rarely shows up in small tests. The out-of-bounds read in introsort needs runs of equal elements longer than the insertion threshold, typically more than sixteen, so a comparator using `<=` can pass every unit test and crash on production data.

## Writing multi-key comparators correctly

Compare the first key; only when it ties, move on to the next. `std::tie` builds tuples of references and their `<` does exactly that lexicographic walk.

```cpp
#include <string>
#include <tuple>

struct Person { std::string name; int age; };

bool by_age_then_name(const Person& a, const Person& b) {
  return std::tie(a.age, a.name) < std::tie(b.age, b.name);
}
```

`std::tie` needs lvalues. For a derived key such as `a.name.size()`, use `std::forward_as_tuple` or `std::make_tuple`, or spell out the comparison. Since C++20, three-way comparison makes the manual version compact, and `auto operator<=>(const Person&) const = default;` gives memberwise lexicographic ordering in declaration order without a comparator at all. The three-way-comparison topic covers the defaulting rules.

```cpp
#include <compare>
#include <string>

struct Person { std::string name; int age; };

bool by_age_desc_then_name(const Person& a, const Person& b) {
  if (auto c = b.age <=> a.age; c != 0) return c < 0;  // age descending
  return a.name < b.name;
}
```

For floating-point keys, choose what NaN means. `std::strong_order` on IEEE types is a total order that places NaNs consistently and also orders `-0.0` before `+0.0`, so `[](double a, double b) { return std::strong_order(a, b) < 0; }` is a valid comparator for any input. `std::partial_order(a, b) < 0` is not: it is `<` again, NaN problem included.

## Equivalence versus equality

Because ordered containers use equivalence, `operator==` plays no part in their lookup. A case-insensitive `std::set<std::string, CaseLess>` treats `"Apple"` and `"APPLE"` as the same key: inserting the second fails, and `find`, `count` and `contains` locate the first. Generic algorithms that search for a value, such as `std::ranges::find`, use `==` instead, so they disagree with the container.

```cpp
#include <algorithm>
#include <cctype>
#include <set>
#include <string>

struct CaseLess {
  bool operator()(const std::string& a, const std::string& b) const {
    auto lower = [](unsigned char c) { return std::tolower(c); };
    return std::ranges::lexicographical_compare(a, b, {}, lower, lower);
  }
};

void demo() {
  std::set<std::string, CaseLess> s{"Apple"};
  s.insert("APPLE");                        // not inserted: equivalent key
  bool a = s.contains("apple");             // true
  bool b = std::ranges::find(s, std::string("APPLE")) != s.end();  // false
  (void)a; (void)b;
}
```

A comparator that is not a strict weak ordering does more damage in a container than in a sort, because the damage persists. `std::set<int, std::less_equal<int>>` never sees two equal keys as equivalent, so it stores duplicates and then cannot find them. That is undefined behavior too, since [associative.reqmts.general] requires the container's comparator to induce a strict weak ordering on keys. Transparent comparators like `std::less<>` and heterogeneous lookup are covered in the node-handles-and-heterogeneous-lookup topic.

## sort, stable_sort, and what equivalent elements do

`std::sort` puts equivalent elements next to each other in an unspecified relative order. Since C++11 it performs O(N log N) comparisons in the worst case; before that only the average case was specified. `std::stable_sort` keeps equivalent elements in their original relative order. It is O(N log N) when it can allocate a buffer and O(N log² N) when it cannot. `std::list::sort` and `std::forward_list::sort` are stable too.

Stability is what lets you sort by several keys in passes, least significant key first, and it is the only reason to pay the extra cost. If the full sort key is a strict total order, the two algorithms give identical results.

Other algorithms also make promises about equivalent elements, and those promises are only as good as your comparator. `std::max(a, b)` and `std::min(a, b)` both return their first argument when the two are equivalent, so `std::min` and `std::max` of the same equivalent pair return the same object. `std::merge` takes from the first range before the second among equivalent elements, and `std::equal_range` returns exactly the run of elements equivalent to the value. Each of these is a statement about equivalence classes, and none means anything if the classes are not well formed.

## ranges::less, the concept, and projections

`std::ranges::less` is the default comparator for the constrained algorithms. Unlike `std::less<>`, it is constrained with `totally_ordered_with`, so comparing types with no `<` fails at the call rather than deep inside an algorithm. Both produce a strict total order over pointers, which built-in `<` does not guarantee for unrelated objects.

The `strict_weak_order<R, T, U>` concept, used by `std::sortable` through `indirect_strict_weak_order`, checks only syntax: `R` must be a predicate callable with every combination of `T` and `U`. The laws themselves are semantic requirements that no compiler checks. `std::strict_weak_order<std::ranges::less_equal, int, int>` is satisfied.

The constrained algorithms also take a **projection**, applied to each element before the comparator sees it. Projections replace most hand-written key comparators, and the comparator argument can be left as `{}` to keep `ranges::less`.

```cpp
#include <algorithm>
#include <functional>
#include <string>
#include <vector>

struct Person { std::string name; int age; };

void demo(std::vector<Person>& people) {
  std::ranges::sort(people, std::ranges::greater{}, &Person::name);
  std::ranges::sort(people, {}, &Person::age);                   // by age
  auto it = std::ranges::lower_bound(people, 30, {}, &Person::age);
  // it: the first person aged 30 or more
  (void)it;
}
```

In a binary search, the projection is applied to the elements only, never to the value searched for, which is why `lower_bound(people, 30, {}, &Person::age)` compares ages with `30`. The range must already be ordered by that same projected key. Had the two sorts run in the opposite order, the people would be ordered by name, and the search would violate its precondition.

## What to remember

- Library comparators must be strict weak orderings: irreflexive, asymmetric, transitive, and transitive in incomparability.
- Equivalence is `!comp(a, b) && !comp(b, a)`; ordered containers and sorts use it, never `==`.
- Violating the laws is undefined behavior, not an odd order; `<=` can make `std::sort` read out of bounds.
- NaN with `<` breaks transitivity of incomparability; use `std::strong_order` or remove NaNs first.
- Write multi-key comparisons with `std::tie`, `<=>`, or a defaulted `operator<=>`, never `a.x < b.x || a.y < b.y`.
- `std::sort` leaves equivalent elements in unspecified order; `std::stable_sort` and `list::sort` preserve it.
- The `strict_weak_order` concept is syntactic; `ranges::less_equal` satisfies it.
- Projections apply to elements, not to the searched value, and the range must be ordered by the projected key.
