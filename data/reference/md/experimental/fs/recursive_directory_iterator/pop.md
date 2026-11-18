# std::experimental::filesystem::recursive_directory_iterator::pop

Source: https://en.cppreference.com/w/cpp/experimental/fs/recursive_directory_iterator/pop

```cpp
void pop(); // (filesystem TS)
```

Moves the iterator one level up in the directory hierarchy.

If the parent directory is outside directory hierarchy that is iterated on (i.e. `depth() == 0`), sets `*this` to an end directory iterator.

## Parameters

(none)

## Return value

(none)

## Exceptions

> Note: This section is incomplete
