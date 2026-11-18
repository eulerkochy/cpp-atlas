---
title: "Optional, expected, and error codes"
summary: "Choosing value-based error channels in modern C++: std::optional, C++23 std::expected, monadic combinators, and std::error_code vs std::error_condition."
track: errors
minutes: 10
standard:
  - "[optional]"
  - "[expected]"
  - "[syserr]"
  - "[syserr.errcode]"
  - "[syserr.errcondition]"
  - "[syserr.errcat]"
cppreference:
  - title: "std::optional"
    path: "utility/optional"
  - title: "std::expected"
    path: "utility/expected"
  - title: "std::unexpected"
    path: "utility/expected/unexpected"
  - title: "std::error_code"
    path: "error/error_code"
  - title: "std::error_condition"
    path: "error/error_condition"
  - title: "std::system_error"
    path: "error/system_error"
prerequisites:
  - "exception-safety-guarantees"
  - "value-categories"
---

Exceptions excel when errors cross many architectural layers toward a central recovery boundary, yet plenty of failures are local, expected outcomes: a missing cache entry, a malformed token, or a non-blocking socket returning `EAGAIN`. Modern C++ equips you with three composable value-returning abstractions—`std::optional`, C++23 `std::expected`, and `std::error_code`—that keep control flow explicit in function signatures with zero hidden heap allocation.

## Matching the channel to the failure

Selecting the right error vocabulary depends on whether callers need *why* something failed, whether failures are rare or routine, and whether status values cross OS or ABI boundaries.

| Mechanism | Meaning of non-value state | Carries error reason | Inline storage | Propagation style |
| --- | --- | --- | --- | --- |
| Exceptions | Stack unwind on exceptional path | Rich polymorphic type | Dynamic runtime object | Implicit across frames |
| `std::optional<T>` | Value absent is normal | None | `sizeof(T)` + flag | Explicit check or monadic |
| `std::expected<T, E>` | Operation failed with typed `E` | Typed payload `E` | Overlapping `T`/`E` + flag | Explicit check or monadic |
| `std::error_code` | OS or domain status code | Integer + category pointer | Two machine words | Return value or `system_error` |

Use `std::optional<T>` when absence carries no diagnostic ambiguity—finding a key in a map or parsing an optional header field. Reach for `std::expected<T, E>` when callers must inspect or propagate *why* a computation failed. Pair it with `std::error_code` when wrapping operating-system errors or unifying heterogeneous library error enums into a single compact type.

## std::optional and the monadic pipeline

`std::optional<T>` manages aligned inline storage alongside a boolean engagement state—never allocating on the heap. Reading a disengaged optional via `*opt` or `opt->member` triggers **undefined behavior**, whereas `opt.value()` performs a bounds check and throws `std::bad_optional_access`.

C++23 enriched `std::optional` with three monadic member functions that eliminate nested `if (!opt)` boilerplate:

- `.and_then(fn)` invokes `fn(*opt)` when engaged, where `fn` returns another `std::optional<U>`.
- `.transform(fn)` maps `*opt` through `fn` and wraps the result in `std::optional<U>` automatically.
- `.or_else(fn)` invokes `fn()` returning a fallback `std::optional<T>` only when disengaged.

```cpp
#include <optional>
#include <string_view>

std::optional<int> parse_port(std::string_view sv) {
    if (sv == "8080") return 8080;
    return std::nullopt;
}

int resolve_port(std::optional<std::string_view> raw) {
    return raw
        .and_then(parse_port)
        .transform([](int p) { return p + 1; })
        .value_or(80);
}
```

> **Pitfall.** Checking `if (opt)` on a `std::optional<bool>` tests whether a `bool` is present, **not** whether the contained `bool` is `true`. An engaged `std::optional<bool>{false}` is truthy in boolean contexts! Write `opt.value_or(false)` or `opt == true` to inspect the underlying boolean value.

Notice also that in C++23 `std::optional<T&>` is ill-formed; nullable non-owning references are expressed with raw pointers `T*` or `std::optional<std::reference_wrapper<T>>`.

## C++23 std::expected and std::unexpected

`std::expected<T, E>` models a discriminated union holding either an expected value `T` or an unexpected error `E`, stored inline without dynamic allocation. Unlike `std::optional`, it even supports `T = void` (`std::expected<void, E>`) for side-effectful functions whose only success payload is "no error occurred".

When `T` and `E` are identical or mutually convertible—for example `std::expected<int, int>`—constructing the error state requires wrapping the error in `std::unexpected(err)` (or using `std::unexpect` in-place tag):

```cpp
#include <expected>
#include <string_view>

enum class ParseErr { empty, invalid_digit };

std::expected<int, ParseErr> to_count(std::string_view sv) {
    if (sv.empty()) return std::unexpected(ParseErr::empty);
    if (sv[0] < '0' || sv[0] > '9') return std::unexpected(ParseErr::invalid_digit);
    return sv[0] - '0';
}

std::expected<int, int> disambiguate(bool fail) {
    if (fail) return std::unexpected(404); // constructs error E
    return 200;                            // constructs value T
}
```

`std::expected` mirrors the C++23 monadic API of `std::optional`, adding `.transform_error(fn)` so you can adapt a low-level error `E1` into a higher-level domain error `E2` mid-pipeline while preserving any `T` value untouched. Calling `.value()` on an unexpected state throws `std::bad_expected_access<E>`, whereas `.error()` on a value-holding expected is undefined behavior—always check `has_value()` or `if (res)` first.

> **Standardese.** Per `[expected.object.general]`, `std::expected<T, E>` guarantees that `T` and `E` occupy overlapping inline storage with no valueless-by-exception state whenever constructing the replacement alternative cannot throw or a nothrow-movable backup protects the switch.

## std::error_code vs std::error_condition

The `<system_error>` header contains two deceptively similar types whose distinction unlocks clean cross-platform APIs:

- **`std::error_code`** represents a **platform-specific or domain-specific raw error**: two machine words storing an integer code `int` plus a pointer `const std::error_category*`. It preserves exact OS details (such as POSIX `ENOENT` or Win32 `ERROR_FILE_NOT_FOUND`) for logging and diagnostics.
- **`std::error_condition`** represents a **portable semantic category** that application logic matches against—most commonly the POSIX-inspired `std::errc` enumerators such as `std::errc::no_such_file_or_directory` or `std::errc::permission_denied`.

> **Mental model.** Think of `std::error_code` as the raw sensor reading reported by a specific subsystem, and `std::error_condition` as the portable diagnosis your error-handling `if` statement checks against.

When you write `ec == std::errc::no_such_file_or_directory`, `<system_error>` invokes `ec.category().equivalent(...)` (calling `default_error_condition(ec.value())`) to translate a platform `error_code` into a portable `error_condition` without discarding the original OS code stored inside `ec`. Throwing `std::system_error(ec)` bridges the gap whenever a lower layer uses `error_code` and an upper layer expects exceptions.

## Custom error categories and zero-allocation design

You can plug your own error enum directly into `std::error_code` and `std::expected<T, std::error_code>` without modifying `<system_error>`. Three pieces complete the integration:

1. Define a `std::error_category` subclass returned from a singleton function (`error_category` equality compares object identity).
2. Specialize `std::is_error_code_enum<YourEnum>` as `std::true_type`.
3. Provide a free `make_error_code(YourEnum)` function in **your enum's own namespace** so argument-dependent lookup (ADL) discovers it automatically (never place overloads inside `namespace std`).

```cpp
#include <expected>
#include <string>
#include <system_error>
#include <type_traits>

enum class ConfigErr { missing_file = 1, bad_syntax = 2 };

class ConfigCategory final : public std::error_category {
public:
    const char* name() const noexcept override { return "config"; }
    std::string message(int ev) const override {
        switch (static_cast<ConfigErr>(ev)) {
            case ConfigErr::missing_file: return "configuration file not found";
            case ConfigErr::bad_syntax:   return "malformed configuration entry";
        }
        return "unknown config error";
    }
    std::error_condition default_error_condition(int ev) const noexcept override {
        if (static_cast<ConfigErr>(ev) == ConfigErr::missing_file) {
            return std::errc::no_such_file_or_directory;
        }
        return std::error_condition(ev, *this);
    }
};

inline const std::error_category& config_category() noexcept {
    static const ConfigCategory instance;
    return instance;
}

inline std::error_code make_error_code(ConfigErr e) noexcept {
    return {static_cast<int>(e), config_category()};
}

template <>
struct std::is_error_code_enum<ConfigErr> : std::true_type {};

std::expected<int, std::error_code> load_timeout(bool present) {
    if (!present) return std::unexpected(ConfigErr::missing_file);
    return 30;
}
```

Because `ConfigErr` opts into `std::is_error_code_enum`, callers can check `!res && res.error() == std::errc::no_such_file_or_directory` across any platform while keeping `res.error().message()` domain-specific and `sizeof(std::error_code)` fixed at two pointers.

> **Pitfall.** Unchecked dereferencing (`*opt`, `*res`) on an empty `std::optional` or error-holding `std::expected`—and calling `res.error()` on a value-holding `std::expected`—invokes undefined behavior rather than throwing. Guard access with `has_value()` or stick to `.value()`, `.value_or()`, and monadic combinators.

## What to remember

- Choose **`std::optional<T>`** when absence is normal and needs no explanation, **`std::expected<T, E>`** when callers must know *why* an operation failed, and **exceptions** when unwinding across decoupled layers.
- Never assume `if (opt)` checks the value inside `std::optional<bool>`; test `opt.value_or(false)` or compare against `true`.
- Prefer `.and_then`, `.transform`, `.or_else`, and `.transform_error` in C++23 to compose error pipelines without losing type safety or calling unchecked `*` / `.error()`.
- Store platform or domain failures in **`std::error_code`** and write portable comparisons against **`std::error_condition`** (`std::errc`).
- Define `make_error_code` in your custom enum's namespace for ADL alongside a `std::is_error_code_enum` specialization and a singleton `std::error_category`.
