# std::experimental::filesystem::directory_iterator::operator=

Source: https://en.cppreference.com/w/cpp/experimental/fs/directory_iterator/increment

```cpp
directory_iterator& operator++();

directory_iterator& increment( error_code& ec ) noexcept; // (filesystem TS)
```

Advances the iterator to the next entry.

> Note: This section is incomplete

## Parameters

- `ec` - error code to store error status to

## Return value

`*this`

## Exceptions

1)

   > Note: This section is incomplete

2)

   `noexcept` specification:

   `noexcept`
