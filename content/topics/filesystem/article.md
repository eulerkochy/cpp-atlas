---
title: "std::filesystem"
summary: "A path is a value that names a location, not a handle to a file, and most of its member functions are pure text manipulation. The rest of the library asks the operating system questions whose answers can change at any moment, which is why every operation comes in a throwing and a non-throwing form and why check-then-act code is wrong."
track: "utilities"
minutes: 13
standard:
  - "[fs.class.path]"
  - "[fs.path.generic]"
  - "[fs.path.append]"
  - "[fs.path.compare]"
  - "[fs.err.report]"
  - "[fs.race.behavior]"
  - "[fs.enum.copy.opts]"
  - "[fs.op.canonical]"
cppreference:
  - title: "std::filesystem::path"
    path: "filesystem/path"
  - title: "std::filesystem::path::lexically_normal"
    path: "filesystem/path/lexically_normal"
  - title: "std::filesystem::canonical"
    path: "filesystem/canonical"
  - title: "std::filesystem::directory_iterator"
    path: "filesystem/directory_iterator"
  - title: "std::filesystem::recursive_directory_iterator"
    path: "filesystem/recursive_directory_iterator"
  - title: "std::filesystem::copy_options"
    path: "filesystem/copy_options"
  - title: "std::filesystem::file_status"
    path: "filesystem/file_status"
  - title: "std::filesystem::space"
    path: "filesystem/space"
  - title: "std::filesystem::file_time_type"
    path: "filesystem/file_time_type"
  - title: "std::filesystem::path::u8path"
    path: "filesystem/path/u8path"
prerequisites:
  - "strings-and-string-view"
  - "optional-expected-and-error-codes"
  - "chrono"
---

## The one idea

The library has two layers that look alike and behave nothing alike. A `std::filesystem::path` is a value type holding a string and rules for splitting it into pieces. Most of its members, `filename`, `extension`, `parent_path`, `lexically_normal`, never touch the disk. Everything else, `exists`, `canonical`, `directory_iterator`, `copy`, is a request to an operating system that shares the disk with every other process. Those answers describe the moment of the call and nothing longer.

> **Mental model.** A path is text. A filesystem function is a question to the world. Never expect a text operation to know what is on disk, and never expect an answer from the disk to still be true on the next line.

## Path as text

On POSIX a path stores `char`, and on Windows `wchar_t`. `native()` returns that storage; `string()` converts it to a narrow string in the platform's encoding; `generic_string()` converts it and also uses `/` as the separator. The **generic format** is the portable spelling with forward slashes, and the **native format** is whatever the platform prefers. On POSIX they are the same.

Decomposition follows lexical rules that are worth knowing exactly:

```cpp
#include <filesystem>
#include <iostream>

int main() {
  using std::filesystem::path;
  path p = "/tmp/archive.tar.gz";
  std::cout << p.stem() << ' ' << p.extension() << '\n';   // "archive.tar" ".gz"
  std::cout << path(".bashrc").extension() << '\n';         // "" a leading dot is not an extension
  std::cout << path("a/b/").filename() << '\n';             // "" trailing separator gives empty filename
  std::cout << path("a/b/").parent_path() << '\n';          // "a/b"
  for (auto& part : path("a/b/")) std::cout << '<' << part << '>';  // <a><b><>
}
```

Joining paths has one rule that causes real bugs. `operator/` is `append`, and `append` **replaces** the left side when the right side is absolute, because an absolute path already names a complete location.

```cpp
#include <filesystem>
using std::filesystem::path;

void demo() {
  path a = path("/usr/lib") / "/opt";   // "/opt", the left side is discarded
  path b = path("/usr/lib") / "opt";    // "/usr/lib/opt"
  path c = path("a") / "";              // "a/", an empty right side adds a separator
  path d = "a";
  d += "b";                             // += is plain concatenation: "ab", no separator
}
```

This means `base / user_supplied` can escape `base` when the supplied part starts with `/`, or with `..`. Validate it as text before joining, then verify the result against the real filesystem.

Equality compares element by element. `path("a//b") == path("a/b")` is true because repeated separators vanish, but `path("a/b/")` differs from `path("a/b")` because of the trailing empty element, and `a/./b` differs from `a/b` because `.` is an element. Comparison never normalizes.

## Lexical operations versus filesystem operations

`lexically_normal` removes `.` elements and cancels `name/..` pairs, all as text. `lexically_relative` and `lexically_proximate` compute a path from one to another, also as text. They are fast, never fail, and are right whenever no symlinks are involved. If the result would be empty, `lexically_normal` returns `.`.

The filesystem counterparts ask the operating system. `canonical` makes an absolute path with every symlink resolved, and fails if the path does not exist. `weakly_canonical` resolves as much of the prefix as exists and normalizes the rest lexically, so it works on a path you are about to create. `absolute` only prepends the current directory and does no resolution at all. `equivalent` asks whether two paths reach the same object.

```text
root/
  real/
    sub/
  link -> real/sub

path "root/link/.."
  lexically_normal   -> "root"        link and .. cancel, as text
  canonical          -> ".../real"    the link was followed first, then .. applied
```

The difference matters for security checks. A containment test written with `lexically_normal` and `starts_with` can be defeated by a symlink inside the tree. Resolve with `weakly_canonical` before comparing, and remember that even this is a snapshot.

> **Pitfall.** `lexically_normal` assumes `link/..` names the directory that contains `link`. If `link` is a symlink, the operating system instead gives the parent of the link's target, so the textual answer is a different directory.

## Two error-reporting channels

Nearly every operation has two overloads. The plain one throws `std::filesystem::filesystem_error`, which carries the error code and the paths involved. The overload taking a `std::error_code&` reports failure through that argument and does not throw `filesystem_error`, although functions that allocate can still throw `std::bad_alloc`. When the call fails, the non-throwing form returns a documented sentinel: `file_size` returns `static_cast<std::uintmax_t>(-1)`, and queries such as `exists` return false.

```cpp
#include <filesystem>
#include <iostream>
#include <system_error>

namespace fs = std::filesystem;

void demo(const fs::path& p) {
  try {
    auto n = fs::file_size(p);                // throws filesystem_error if p is missing
    std::cout << n << '\n';
  } catch (const fs::filesystem_error& e) {
    std::cout << e.what() << ' ' << e.path1() << '\n';
  }
  std::error_code ec;
  auto n = fs::file_size(p, ec);              // no throw: n is uintmax_t(-1), ec is set
  if (ec) std::cout << ec.message() << '\n';
}
```

Use the throwing form when failure is exceptional, and the `error_code` form in loops where failure is an expected case. Plain `exists(p)` returns false for a path that is not there without throwing, but throws if the error is something else, such as a permission failure on a parent directory.

## Symlinks, status, and iteration

`status` follows symlinks and `symlink_status` does not. Free functions such as `exists`, `is_directory`, and `is_regular_file` are built on `status`, so a dangling symlink is reported as non-existent, while `is_symlink` is built on `symlink_status` and still sees it. A `file_status` bundles a `file_type` and permission bits.

```cpp
#include <filesystem>
namespace fs = std::filesystem;

// dir/link -> dir/missing  (the target does not exist)
// fs::exists(dir / "link")       is false: status follows the link
// fs::is_symlink(dir / "link")   is true:  symlink_status does not
```

`directory_iterator` visits the entries of one directory, in an unspecified order, and never yields `.` or `..`. `recursive_directory_iterator` descends into subdirectories, but by default it **skips directory symlinks**; the option `follow_directory_symlink` turns following on, and with it comes the risk of cycles. Dereferencing gives a `directory_entry`, which caches attributes, so `e.is_directory()` may avoid a system call but may also be stale. Call `refresh()` or use the free function when freshness matters. If a directory cannot be read, the default is an error; `skip_permission_denied` skips it instead.

## Races, copying, space, and time

The standard states that the behavior is undefined if a call to a filesystem function introduces a **file system race**: threads, processes, or machines interleaving access and modification of the same object in the file system. The consequence for programs is clear. `if (!exists(p)) create_directory(p);` has a gap between the test and the act, called TOCTOU (time of check to time of use), in which another process can act. Do the operation and handle the failure instead: `create_directory` returns false rather than failing when the directory already exists, and an error-code overload gives the reason when something else is wrong.

`copy_file` fails by default when the destination exists. `copy_options` decides what happens instead:

| Option | Effect |
| --- | --- |
| `skip_existing` | leave the existing destination alone and report no copy |
| `overwrite_existing` | replace it |
| `update_existing` | replace it only if the source is newer |
| `recursive` | for `copy`, descend into directories |
| `copy_symlinks`, `skip_symlinks` | copy links as links, or skip them |

`fs::space(p)` returns three numbers: `capacity`, `free`, and `available`. `available` is what an unprivileged process may use and can be smaller than `free`. The values are a snapshot, so reserving space by looking at them is another race.

Timestamps use `std::filesystem::file_time_type`, a `time_point` of an implementation-specific clock before C++20 and of `std::chrono::file_clock` since. It is **not** `system_clock`, and its epoch may differ. Convert with `std::chrono::clock_cast<std::chrono::system_clock>(t)` in C++20 and later, and do not subtract it from a `system_clock` time directly.

## Encoding and C++20 char8_t

A `u8` literal has type `char8_t` in C++20. `path::u8string()` therefore returns `std::u8string` in C++20 and `std::string` in C++17, and code like `std::string s = p.u8string();` stops compiling when the language version moves. Convert deliberately, by copying the bytes or by reinterpreting, and decide at your own boundary which encoding your narrow strings use. The factory `u8path(str)` that existed to say "this string is UTF-8" is deprecated in C++20, since a path can be constructed from a `u8string` or `char8_t` range directly. On POSIX, a `path` built from a `std::string` keeps the bytes unchanged, whatever they mean, while on Windows narrow strings are converted using the system code page unless you go through the wide or UTF-8 forms.

## What to remember

- A `path` is text; only the free functions and iterators consult the disk.
- `operator/` and `append` replace the left side when the right side is absolute; `+=` concatenates without a separator.
- `lexically_normal` is purely textual, returns `.` for an empty result, and is wrong across symlinks; `canonical` requires existence, and `weakly_canonical` does not.
- Path comparison is by elements: `a//b == a/b`, but a trailing slash or a `.` element makes paths differ.
- Every operation has a throwing overload and an `error_code` overload that does not throw `filesystem_error`.
- `status` follows symlinks and `symlink_status` does not; `exists` on a dangling symlink is false.
- Directory iteration order is unspecified, `.` and `..` are skipped, and recursive iteration does not follow directory symlinks by default.
- Interleaved access by others is a file system race, which the standard makes undefined; do the operation and handle its failure instead of testing first.
- `copy_file` fails on an existing target unless `copy_options` says otherwise, and `space` results are only a snapshot.
- `file_time_type` uses its own clock; use `clock_cast` to reach `system_clock`.
- `u8string()` returns `std::u8string` since C++20, and `u8path` is deprecated.
