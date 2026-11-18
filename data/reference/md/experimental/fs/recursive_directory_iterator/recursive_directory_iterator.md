# std::experimental::filesystem::recursive_directory_iterator::recursive_directory_iterator

Source: https://en.cppreference.com/w/cpp/experimental/fs/recursive_directory_iterator/recursive_directory_iterator

```cpp
recursive_directory_iterator(); // (1) (filesystem TS)

recursive_directory_iterator( const recursive_directory_iterator& ) = default; // (2) (filesystem TS)

recursive_directory_iterator( recursive_directory_iterator&& ) = default; // (3) (filesystem TS)

explicit recursive_directory_iterator( const path& p,
                                       directory_options options = directory_options::none ); // (4) (filesystem TS)

recursive_directory_iterator( const path& p,
                              directory_options options, error_code& ec ); // (5) (filesystem TS)

recursive_directory_iterator( const path& p, error_code& ec ); // (6) (filesystem TS)
```

Constructs new recursive directory iterator.

1) Default constructor. Constructs an end iterator.

2,3) Default copy and move constructors.

4-6) Constructs an iterator that refers to the first entry in the directory that `p` resolves to.

> Note: This section is incomplete Reason: errors

## Parameters

> Note: This section is incomplete

## Exceptions

1,5,6)

   `noexcept` specification:

   `noexcept`

> Note: This section is incomplete

## Notes

Recursive directory iterators do not follow directory symlinks by default. To enable this behavior, specify `directory_options::follow_directory_symlink` among the `options` option set.
