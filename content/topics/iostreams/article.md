---
title: "Iostreams"
summary: "An iostream is a formatting layer on top of a buffer layer, with a state word that records what went wrong. Most iostream bugs come from reading the state bits wrong, from sticky formatting, or from mixing the formatted and unformatted halves of the interface."
track: "utilities"
minutes: 13
standard:
  - "[iostate.flags]"
  - "[istream.formatted]"
  - "[istream.unformatted]"
  - "[ostream.formatted]"
  - "[facet.num.get.virtuals]"
  - "[iostream.objects.overview]"
  - "[syncstream]"
  - "[spanstream]"
cppreference:
  - title: "std::basic_ios"
    path: "io/basic_ios"
  - title: "std::basic_istream"
    path: "io/basic_istream"
  - title: "std::basic_streambuf"
    path: "io/basic_streambuf"
  - title: "std::ios_base::sync_with_stdio"
    path: "io/ios_base/sync_with_stdio"
  - title: "std::basic_osyncstream"
    path: "io/basic_osyncstream"
  - title: "std::basic_spanstream"
    path: "io/basic_spanstream"
  - title: "std::setw"
    path: "io/manip/setw"
  - title: "std::basic_ifstream"
    path: "io/basic_ifstream"
prerequisites:
  - "strings-and-string-view"
  - "exceptions-and-stack-unwinding"
---

## The one idea

An iostream has two halves. The **stream** (`istream`, `ostream`) converts between values and characters and remembers the outcome. The **stream buffer** (`streambuf`) moves characters to and from a source: a file, a string, a memory span, or the C `stdout`. The stream owns a formatting state (base, width, fill, locale) and a state word with the bits `eofbit`, `failbit`, and `badbit`. Everything surprising about iostreams is a consequence of one of those three things: formatting state that persists, state bits with narrow meanings, and the buffer layer underneath.

```text
 ostream / istream / iostream      formatting, state bits, locale
          |
       basic_ios                   holds the pointer to a streambuf
          |
     streambuf                     buffering and transport
   /     |      \      \
filebuf stringbuf spanbuf syncbuf
```

> **Mental model.** The bits are not an error code. `failbit` means the last operation did not do its job, `eofbit` means the stream ran into the end while trying, and `badbit` means the buffer layer itself broke. A stream in the failed state ignores every later operation until you call `clear()`.

## The state bits and the loop idiom

`good()` is true only when no bit is set. `fail()` is true when `failbit` or `badbit` is set. `eof()` reports `eofbit` alone, and `bad()` reports `badbit` alone. A stream converts to `bool` as `!fail()`, so `if (in)` and `while (in >> x)` test whether the last extraction worked.

The common bug is testing `eof()` before reading, because `eofbit` is set only after an attempt to read past the end, and an attempt can also succeed. Reading `42` from a stream that holds exactly `"42"` sets `eofbit` because the number parser needed one more character to know it was done, yet the read succeeded.

```cpp
#include <iostream>
#include <sstream>

int main() {
  std::istringstream in("1 2 3\n");
  int x;
  while (!in.eof()) {            // bug: eof() is still false after reading 3
    in >> x;                     // fails on the trailing newline, x is untouched
    std::cout << x << ' ';       // prints 1 2 3 3
  }
}
```

The correct form puts the extraction itself in the condition.

```cpp
#include <iostream>
#include <sstream>
#include <string>

int main() {
  std::istringstream in("1 2 3\n");
  int x;
  while (in >> x) std::cout << x << ' ';   // 1 2 3

  std::istringstream lines("a\nb\n");
  std::string line;
  while (std::getline(lines, line)) std::cout << line << ';';  // a;b;
}
```

When an extraction fails because the text is not a number, `failbit` is set and, since C++11, the target gets the value 0. If the sentry fails instead, because the stream is already in a failed state or because only whitespace remained, the target is left alone, which is why the buggy loop above repeats its last value. An out-of-range value stores the largest or smallest representable value and sets `failbit`. Extracting `"-1"` into an unsigned type is accepted and wraps, as `strtoull` would do, without setting any bit.

After a failure, call `in.clear()` to reset the state and then deal with the offending characters, usually with `in.ignore(...)`. Note also that `str("...")` on a string stream replaces the contents but does not clear the state bits, so a stream that reached the end must be cleared as well as refilled.

> **Pitfall.** `while (!in.eof())` processes the last item twice on input that ends in a newline, and loops forever on malformed input because `failbit` is set while `eofbit` never is. Test the read, not the bit.

## Formatted versus unformatted input, and mixing the two

Formatted input (`operator>>`) first skips leading whitespace, then parses a value. Unformatted input (`get`, `getline`, `read`, `ignore`, `peek`) takes characters as they come, including whitespace, and `gcount()` reports how many characters the last unformatted call extracted. Both families construct a sentry object first, which checks the stream state and, for formatted input, skips whitespace.

The classic consequence is the leftover newline.

```cpp
#include <iostream>
#include <sstream>
#include <string>

int main() {
  std::istringstream in("5\nhello\n");
  int n;
  std::string line;
  in >> n;                  // reads 5, leaves "\nhello\n"
  std::getline(in, line);   // reads up to the newline: line is empty
  std::getline(in, line);   // line is now "hello"
}
```

Either call `in.ignore(std::numeric_limits<std::streamsize>::max(), '\n')` after the numeric read, or read whole lines first and parse them with a string stream. The latter also gives you a per-line failure state.

Since C++20, extracting into a character array uses the array's size as the limit. Before that the unbounded `operator>>(char*)` was a buffer overflow waiting for a long word, and `std::setw` was the mitigation.

## Sticky and one-shot formatting

Most manipulators change the stream's formatting state permanently: `std::hex`, `std::fixed`, `std::setprecision`, `std::setfill`, `std::left`, `std::boolalpha`. One does not: **`std::setw` applies to the next formatted output and then resets to zero.** Width also never truncates; a string longer than the width prints in full.

```cpp
#include <iomanip>
#include <iostream>

int main() {
  std::cout << std::hex << std::setw(4) << std::setfill('0') << 255 << ' ' << 255 << '\n';
  // 00ff ff   hex and fill stay, width was used up by the first 255
  std::cout << 255 << '\n';  // ff: still hex, which is why code saves and restores flags
}
```

Because the state sticks to the stream object, a function that sets `std::hex` on a stream it was given changes later output of unrelated code. Save `std::ios_base::flags()` and restore them, or format into a temporary `std::ostringstream`. This stickiness is one of the reasons the newer `std::format` is easier to reason about.

## Speed and synchronization

`std::endl` writes a newline and flushes; `'\n'` only writes a newline. Flushing on every line costs a system call for each one when the output is a file or pipe. Use `'\n'`, and flush deliberately when you need output to appear before a crash or before a prompt.

Two settings commonly slow down `cin` and `cout`. By default the standard streams are **synchronized** with C stdio, so a program may mix `printf` and `cout` and get a sensible order, at the price of typically slower, less buffered access. Calling `std::ios::sync_with_stdio(false)` before any input or output removes that, and the streams use their own buffers. After that, mixing the two APIs on the same stream is no longer safe, and the standard's guarantee that concurrent use of the standard streams from several threads is not a data race applies only while synchronized. The second setting is that `cin` is tied to `cout`, meaning `cout` is flushed before every `cin` read. `std::cin.tie(nullptr)` removes that, which is fine unless you rely on a prompt appearing first.

```cpp
#include <iostream>

int main() {
  std::ios::sync_with_stdio(false);  // before the first I/O operation
  std::cin.tie(nullptr);             // do not flush cout before each read
  int x;
  while (std::cin >> x) std::cout << x * 2 << '\n';
}
```

Even in the synchronized case, the standard only says concurrent access is free of data races; characters from different threads can still interleave. C++20's `std::osyncstream` solves that: it wraps another stream, collects output in its own buffer, and transfers it to the target as one unit when `emit()` is called or the object is destroyed. Writes from different `osyncstream` objects to the same target do not interleave.

```cpp
#include <iostream>
#include <syncstream>

void log(int id) {
  std::osyncstream out(std::cout);   // buffered privately
  out << "worker " << id << " done\n";
}                                    // destroyed here: emitted as one block
```

## String streams, span streams, files, and locale

`std::istringstream`, `std::ostringstream`, and `std::stringstream` wrap a `std::string`. `str()` returns a copy of the content, which costs an allocation. C++23's `std::ispanstream`, `std::ospanstream`, and `std::spanstream` instead use a character buffer you own, with no allocation and no copy. You read the written part back with `span()`. An `ospanstream` does not add a null terminator, and writing past the end of the buffer sets `badbit`, so size the buffer for the worst case.

File streams take an open mode, and the combination decides whether the file is created, truncated, or must already exist.

| Mode | Meaning | C equivalent |
| --- | --- | --- |
| `in` | read, must exist | `"r"` |
| `out` or `out\|trunc` | write, create or truncate | `"w"` |
| `out\|app` | append writes at the end | `"a"` |
| `in\|out` | read and write, must exist, no truncation | `"r+"` |
| `in\|out\|trunc` | read and write, create or truncate | `"w+"` |

Add `binary` to avoid newline translation on platforms that have it. An `ofstream` always adds `out` to the mode you pass, and an `ifstream` always adds `in`. A failed open does not throw by default; it sets `failbit`, so test the stream after constructing it.

Each stream holds a `std::locale` that is copied from the global locale when the stream is constructed and decides how numbers are printed and parsed: decimal point, digit grouping, `boolalpha` names. This is why changing the global locale after a stream was built does not affect that stream, and why `imbue` exists.

Finally, a stream can be told to report failures by throwing. `in.exceptions(std::ios::failbit)` makes every transition to the failed state throw `std::ios_base::failure`, which turns the end of the `while (in >> x)` loop into an exception. That is rarely what you want for input, so the usual mask is `badbit` only, or nothing. An exception thrown from inside a library formatted operation, for example by the stream buffer, is caught by the stream, recorded as `badbit`, and rethrown only if `badbit` is in the mask. A user-written `operator<<` is an ordinary function and is not wrapped this way.

## What to remember

- Streams are a formatting layer over a `streambuf`; the formatting state and the state bits live on the stream.
- `failbit` means the operation failed, `eofbit` means it hit the end, `badbit` means the buffer broke. A stream converts to `bool` as `!fail()`.
- Put the read in the loop condition: `while (in >> x)` and `while (std::getline(in, s))`. Never loop on `eof()`.
- A successful read can set `eofbit`, and a sentry failure leaves the target unchanged.
- `setw` is one-shot and never truncates; hex, fill, precision, and alignment stay until changed.
- `>>` leaves the newline behind, so `getline` after it returns an empty line.
- `'\n'` does not flush and `endl` does; `sync_with_stdio(false)` and `cin.tie(nullptr)` speed up the standard streams, at the cost of the synchronization guarantees.
- `std::osyncstream` (C++20) keeps a thread's output together; `std::spanstream` (C++23) streams over your own buffer.
- File modes decide creation and truncation; a failed open sets `failbit` and does not throw.
- `exceptions(failbit)` turns the end of a read loop into an exception.
