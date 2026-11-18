# std::experimental::filesystem::path::make_preferred

Source: https://en.cppreference.com/w/cpp/experimental/fs/path/make_preferred

```cpp
path& make_preferred() // (1) (filesystem TS)
```

Converts all directory separators in path to the preferred directory separator.

For example, on systems, where `\` is the preferred separator, the path `foo/bar` will be converted to `foo\bar`.

## Parameters

(none)

## Return value

`*this`

## Exceptions

May throw implementation-defined exceptions.

## See also

> Note: This section is incomplete
