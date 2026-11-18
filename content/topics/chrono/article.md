---
title: "chrono"
summary: "std::chrono puts the unit into the type. A duration is a count and a ratio, a time point is a duration since a clock's epoch, and a clock says where time points come from. The rules that matter are which conversions are implicit, what each clock promises, and how C++20 calendars and time zones handle dates that do not exist."
track: "utilities"
minutes: 15
standard:
  - "[time.duration]"
  - "[time.duration.cast]"
  - "[time.point]"
  - "[time.clock]"
  - "[time.clock.system]"
  - "[time.clock.steady]"
  - "[time.cal]"
  - "[time.zone]"
  - "[time.format]"
cppreference:
  - title: "Date and time utilities"
    path: "chrono"
  - title: "std::chrono::duration"
    path: "chrono/duration"
  - title: "std::chrono::duration_cast"
    path: "chrono/duration/duration_cast"
  - title: "std::chrono::time_point"
    path: "chrono/time_point"
  - title: "std::chrono::system_clock"
    path: "chrono/system_clock"
  - title: "std::chrono::steady_clock"
    path: "chrono/steady_clock"
  - title: "std::chrono::year_month_day"
    path: "chrono/year_month_day"
  - title: "std::chrono::zoned_time"
    path: "chrono/zoned_time"
  - title: "std::chrono::utc_clock"
    path: "chrono/utc_clock"
prerequisites:
  - "integer-arithmetic-and-overflow"
  - "implicit-conversions"
---

## The one idea

A time quantity in `<chrono>` is three separate ideas, each with its own type. A **duration** is a length of time: a count plus a unit. A **time point** is a position in time: a duration measured from a clock's epoch. A **clock** is a source of time points, and it fixes which epoch and which unit.

The point of splitting them is that mistakes become compile errors. You cannot pass a bare `5` where a duration is expected, you cannot add two positions in time, and you cannot subtract a steady-clock time from a system-clock time.

> **Mental model.** A duration is a number with a unit, a time point is a duration with an origin, and the compiler checks the unit and the origin on every operation.

## Durations

`std::chrono::duration<Rep, Period>` stores one value of type `Rep` and has a compile-time `Period`, a `std::ratio` giving seconds per tick. The standard aliases are `nanoseconds` through `hours`, and since C++20 also `days`, `weeks`, `months` and `years`; the last two are fixed average lengths, not calendar months. The standard requires only a minimum width for each rep: a signed integer of at least 64 bits for `nanoseconds`, and at least 35 bits for `seconds`.

The constructor from a count is `explicit`, so `std::chrono::milliseconds ms = 5;` does not compile. Literals live in `std::chrono_literals`: `5ms`, `2h`, `1.5s`.

### Implicit and explicit conversion

A conversion happens implicitly only if it cannot lose precision: either the destination rep is floating point, or the source period is an exact multiple of the destination period and both reps are integral. Everything else needs `duration_cast`.

```cpp
#include <chrono>
using namespace std::chrono;
using namespace std::chrono_literals;

int main() {
  milliseconds a = 2s;                      // OK: seconds to milliseconds is exact
  duration<double> b = 1500ms;              // OK: floating-point rep never truncates
  // seconds c = 1500ms;                    // ill-formed: would truncate
  seconds d = duration_cast<seconds>(1500ms);   // OK: explicit, truncates to 1s
  (void)a; (void)b; (void)d;
}
```

`duration_cast` truncates toward zero, which for negative values is not what most people expect. C++17 added `floor`, `ceil` and `round` for durations: `floor` goes toward negative infinity, `ceil` toward positive infinity, and `round` goes to the nearest, with ties to the even value.

```cpp
#include <chrono>
#include <cstdio>
using namespace std::chrono;
using namespace std::chrono_literals;

int main() {
  std::printf("%lld %lld\n",
    (long long)duration_cast<seconds>(-1500ms).count(),   // -1: toward zero
    (long long)floor<seconds>(-1500ms).count());          // -2: toward negative infinity
  std::printf("%lld %lld\n",
    (long long)round<seconds>(2500ms).count(),            // 2: tie goes to even
    (long long)round<seconds>(3500ms).count());           // 4
}
```

### Arithmetic

Adding or comparing two durations first converts both to their common type, the longest period that divides both. `2h + 30min` is therefore a `minutes` holding 150. Multiplying or dividing by a plain number keeps the unit: `1s / 2` is a `seconds` and, because the rep is integral, equals zero seconds. Dividing a duration by a duration gives a unitless number in the common rep, so `1500ms / 1s` is the integer 1, while `duration<double>(1500ms) / 1s` is 1.5. If you want a fraction of a unit, make the rep floating point first.

## Overflow in nanoseconds

Duration arithmetic is plain arithmetic on the rep, and for the standard aliases the rep is a signed integer, so overflow is undefined behavior. There is no saturation and no check.

The range is smaller than it looks. A 64-bit count of nanoseconds covers about 292 years in total, which is roughly the years 1678 to 2262 around the Unix epoch. Converting a large coarse duration to `nanoseconds` can overflow silently, and so can storing system time in `nanoseconds` far from 1970.

```cpp
#include <chrono>
using namespace std::chrono_literals;

constexpr std::chrono::nanoseconds bump(std::chrono::nanoseconds n) { return n + 1ns; }

constexpr auto fine = bump(0ns);                                // OK: 1ns
// constexpr auto bad = bump(std::chrono::nanoseconds::max());  // ill-formed: signed overflow
//                                                              // is not a constant expression
int main() { (void)fine; }
```

Constant evaluation rejects the overflow, which is a convenient way to check an assumption at compile time. At run time, the same expression is simply undefined behavior, so sanitizers and range checks are your only protection. The topic on integer arithmetic covers the general rules.

## Clocks and time points

A `time_point<Clock, Duration>` holds a duration since the clock's epoch. Subtracting two time points of the same clock gives a duration; adding a duration gives a time point; adding two time points does not compile; and time points of different clocks do not mix.

| Clock | Use it for | Notes |
| --- | --- | --- |
| `system_clock` | wall-clock time, calendar dates | can jump when the system time is adjusted; epoch is Unix time since C++20 |
| `steady_clock` | measuring intervals | never goes backwards; epoch is arbitrary, so values are meaningless alone |
| `high_resolution_clock` | rarely anything | the standard allows it to be an alias of another clock, and often is |
| `utc_clock` (C++20) | UTC including leap seconds | counts leap seconds, unlike `system_clock` |
| `tai_clock` (C++20) | atomic time | no leap seconds; epoch 1958-01-01 |
| `gps_clock` (C++20) | GPS time | no leap seconds; epoch 1980-01-06 |
| `file_clock` (C++20) | file timestamps | the clock behind `filesystem::file_time_type`; epoch unspecified |

`high_resolution_clock` is a trap rather than a tool. Depending on the library it is `system_clock`, `steady_clock`, or a separate clock. If it is the first, a timing measurement can run backwards when the system clock is corrected. Measure intervals with `steady_clock`.

```cpp
#include <chrono>
#include <cstdio>

int main() {
  auto start = std::chrono::steady_clock::now();
  // ... work ...
  auto elapsed = std::chrono::steady_clock::now() - start;   // a duration
  auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(elapsed);
  std::printf("%lld ms\n", static_cast<long long>(ms.count()));
}
```

The C++20 clocks convert to each other with `std::chrono::clock_cast`. The conversion between `system_clock` and `utc_clock` accounts for leap seconds, so the two differ by a whole number of seconds that grows over the years. The precision of `now()` and the duration type it returns are implementation choices, so write code that does not depend on either.

## Calendar types

C++20 added value types for the pieces of a date: `year`, `month`, `day`, `weekday`, and the combinations `year_month_day`, `year_month_weekday` and others. The `/` operator builds them, and the literals `2024y` and `15d` and the constants `January` to `December` make the code read like a date. The result is a plain value type with no clock and no time zone.

```cpp
#include <chrono>
#include <iostream>
using namespace std::chrono;

int main() {
  year_month_day a = 2024y / February / 29;     // valid: 2024 is a leap year
  year_month_day b = 2023y / February / 30;     // constructs fine, but not a real date
  std::cout << a.ok() << b.ok() << '\n';        // 10

  year_month_day c = 2024y / January / 31;
  c += months{1};                               // no clamping: this is February 31
  std::cout << c.ok() << ' ' << unsigned(c.day()) << '\n';   // 0 31

  auto end_of_feb = 2024y / February / last;    // year_month_day_last
  std::cout << unsigned(end_of_feb.day()) << '\n';   // 29
}
```

Constructing an invalid date is not an error; `ok()` tells you whether it is real. Month arithmetic keeps the day number and does not clamp, so `January 31 + 1 month` is `February 31`, which is invalid until you check it. Arithmetic on `month` and `weekday` alone wraps: `December + months{1}` is `January`. Always call `ok()` on dates that come from input or arithmetic.

> **Pitfall.** `2024/2/29` is integer division and gives `34`, not a date. At least one operand of the first `/` must be a `year`, `month` or `day` type, such as `2024y`.

The bridge to the rest of chrono is `sys_days`, a `time_point` on `system_clock` with a resolution of one day. A `year_month_day` converts to `sys_days` and back, and `sys_days` plus a number of `days` is ordinary time point arithmetic.

> **Standardese.** The conversion from `year_month_day` to `sys_days` in [time.cal.ymd.members] is specified for invalid days too, as long as the year and month are valid: the result is the first of the month plus the day number minus one. So `2023y/February/30` converts to the same `sys_days` as `2023y/March/2`. If the year or month is itself invalid, the result is unspecified.

## Time zones and zoned_time

A `sys_time` is UTC. A `local_time` is a time of day on a calendar with no zone attached, and it is deliberately a different type so you cannot mix them by accident. A `zoned_time` pairs a time zone with a point in time and can show it either way.

Time zones come from the IANA database, reached with `std::chrono::locate_zone("Asia/Kolkata")` or `current_zone()`. The library needs a time zone database at run time; where none is available, these calls can throw. Check that your platform ships one.

Going from UTC to local time always works. Going the other way can fail, because local time is not a one-to-one mapping. When clocks jump forward, a range of local times never happens, and when they jump back, a range happens twice. Constructing a `zoned_time` from such a local time throws `nonexistent_local_time` or `ambiguous_local_time`, unless you pass `choose::earliest` or `choose::latest` to resolve the overlap.

```cpp
#include <chrono>
#include <iostream>
#include <format>
using namespace std::chrono;
using namespace std::chrono_literals;

int main() {
  try {   // New York skips 02:00 to 03:00 on 2024-03-10
    zoned_time z{"America/New_York", local_days{2024y / March / 10} + 2h + 30min};
  } catch (const nonexistent_local_time&) {
    std::cout << "gap\n";
  }
  // 01:30 happens twice on 2024-11-03; ask for the first one
  zoned_time z{"America/New_York", local_days{2024y / November / 3} + 1h + 30min,
               choose::earliest};
  std::cout << std::format("{:%F %T %Z}\n", z);   // 2024-11-03 01:30:00 EDT
}
```

Store and compare instants in UTC (`sys_time`), and convert to a zone only to display. Adding `24h` to a `sys_time` moves exactly one physical day, while adding `days{1}` to a `local_time` moves to the same wall-clock time on the next date. Across a daylight saving change those are different instants.

## Formatting

With `std::format`, a duration prints its count followed by a unit suffix, and a time point or date prints as a date or date and time. A chrono format spec after the colon selects fields: `%F` is year-month-day, `%T` is hours, minutes and seconds, `%H:%M` is a clock time, and `%Z` is the zone abbreviation. The format-and-print topic covers the general machinery.

```cpp
#include <chrono>
#include <format>
#include <iostream>
using namespace std::chrono;
using namespace std::chrono_literals;

int main() {
  std::cout << std::format("{} {} {:%H:%M}\n", 90s, 1500ms, 90min);   // 90s 1500ms 01:30
  std::cout << std::format("{}\n", sys_days{2024y / February / 29});  // 2024-02-29
  std::cout << std::format("{:%F %T}\n", sys_seconds{1700000000s});   // 2023-11-14 22:13:20
}
```

## What the type system catches

- `milliseconds ms = 5;` fails because the count constructor is explicit, so you cannot lose the unit by accident.
- `seconds s = 1500ms;` and `milliseconds ms = 1.5s;` fail because they would truncate; spell the loss with `duration_cast`, `floor`, `ceil` or `round`.
- `sleep_for(5)` does not compile; a bare number has no unit.
- `now_a + now_b` for two time points does not compile, since adding two positions is meaningless, while `now_b - now_a` is a duration.
- A `steady_clock` time point cannot be compared to a `system_clock` one.
- A `local_time` cannot be passed where a `sys_time` is expected.

What the type system does not catch is overflow, an invalid date, and a local time that is not unique. Those need `ok()`, range reasoning and the `choose` argument.

## What to remember

- A duration is a count and a ratio, a time point is a duration from an epoch, and a clock supplies the epoch and the unit.
- Implicit duration conversions must be lossless; everything else uses `duration_cast` (toward zero), `floor`, `ceil` or `round` (ties to even).
- The common type of two durations is the finer one, so `2h + 30min` is `minutes{150}`; integer division by a number or another duration truncates.
- Duration overflow on a signed rep is undefined behavior; 64-bit nanoseconds span about 292 years.
- Use `steady_clock` to measure intervals; `high_resolution_clock` may be an alias of another clock, and `system_clock` can jump.
- C++20 adds `utc_clock` with leap seconds, `tai_clock`, `gps_clock` and `file_clock`, with `clock_cast` between them.
- Calendar values can be constructed invalid; check `ok()`. Month arithmetic does not clamp the day.
- `year_month_day` to `sys_days` normalizes an out-of-range day when the year and month are valid.
- `zoned_time` throws for a nonexistent local time and for an ambiguous one unless `choose` says which; store UTC and convert to a zone only to display.
