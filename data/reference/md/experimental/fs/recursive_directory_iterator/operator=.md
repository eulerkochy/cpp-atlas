# std::experimental::filesystem::recursive_directory_iterator::operator=

Source: https://en.cppreference.com/w/cpp/experimental/fs/recursive_directory_iterator/operator=

```cpp
recursive_directory_iterator& operator=( const recursive_directory_iterator& ) = default; // (filesystem TS)
recursive_directory_iterator& operator=( recursive_directory_iterator&& ) = default; // (filesystem TS)
```

Assigns a recursive directory iterator.

## Parameters

- `-` - another directory iterator to assign

## Return value

`*this`

## Exceptions

May throw implementation-defined exceptions.

> Note: This section is incomplete
