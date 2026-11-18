# std::experimental::source_location::source_location

Source: https://en.cppreference.com/w/cpp/experimental/source_location/source_location

```cpp
constexpr source_location() noexcept; // (1) (library fundamentals TS v2)
source_location( const source_location& other ) = default; // (2) (library fundamentals TS v2) (implicitly declared)
source_location( source_location&& other ) = default; // (3) (library fundamentals TS v2) (implicitly declared)
```

1) Constructs a `source_location` object whose values are implementation defined.

2,3) Implicitly declared copy and move constructors.

## Parameters

- `other` - another `source_location` to copy from

## See also

- [`current`](https://en.cppreference.com/w/cpp/experimental/source_location/current) [static]: constructs a new `source_location` (public static member function)
