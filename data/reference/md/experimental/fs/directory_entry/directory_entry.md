# std::experimental::filesystem::directory_entry::directory_entry

Source: https://en.cppreference.com/w/cpp/experimental/fs/directory_entry/directory_entry

```cpp
directory_entry() = default; // (1) (filesystem TS)
directory_entry( const directory_entry& ) = default; // (2) (filesystem TS)
directory_entry( directory_entry&& ) = default; // (3) (filesystem TS)
explicit directory_entry( const path& p ); // (4) (filesystem TS)
```

Constructs a new `directory_entry` object.

1) Default constructor.

2) Default copy constructor.

3) Default move constructor.

4) Initializes the directory entry with path `p`.

## Parameters

> Note: This section is incomplete

## Exceptions

> Note: This section is incomplete
