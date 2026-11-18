# std::visit_format_arg

Source: https://en.cppreference.com/w/cpp/utility/format/visit_format_arg

```cpp
// Defined in header <format>

template< class Visitor, class Context >
/* see below */ visit_format_arg( Visitor&& vis, std::basic_format_arg<Context> arg ); // (since C++20) (deprecated in C++26)
```

Applies the visitor `vis` to the object contained in `arg`.

Equivalent to `std::visit(std::forward<Visitor>(vis), value)`, where `value` is the `std::variant` stored in `arg`.

## Parameters

- `vis` - a *Callable* that accepts every possible alternative from `arg`
- `arg` - a `std::basic_format_arg` to be visited

## Return value

The value returned by the selected invocation of the visitor.

## Notes

As of C++26, `std::visit_format_arg` is deprecated in favor of the `visit` member functions of `std::basic_format_arg`.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`make_format_args`](https://en.cppreference.com/w/cpp/utility/format/make_format_args) (C++20), [`make_wformat_args`](https://en.cppreference.com/w/cpp/utility/format/make_format_args) (C++20): creates a type-erased object referencing all formatting arguments, convertible to `format_args` (function template)
