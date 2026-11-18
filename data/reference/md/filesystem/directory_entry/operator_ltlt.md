# operator<<(std::filesystem::directory_entry)

Source: https://en.cppreference.com/w/cpp/filesystem/directory_entry/operator_ltlt

```cpp
template< class CharT, class Traits >
friend std::basic_ostream<CharT,Traits>&
    operator<<( std::basic_ostream<CharT,Traits>& os, const directory_entry& d ); // (since C++17)
```

Performs stream output on the directory entry `d`. Equivalent to `return os << d.path();`.

This function template is not visible to ordinary unqualified or qualified lookup, and can only be found by argument-dependent lookup when std::filesystem::directory_entry is an associated class of the arguments. This prevents undesirable conversions in the presence of a `using namespace std::filesystem;` using-directive.

## Parameters

- `os` - stream to perform output on
- `d` - `directory_entry` to be inserted

## Return value

`os`

## Exceptions

May throw implementation-defined exceptions.

## Example

```cpp
#include <filesystem>
#include <iostream>
namespace fs = std::filesystem;

int main()
{
    const auto entries = {fs::directory_entry{fs::current_path()},
                          fs::directory_entry{fs::temp_directory_path()}};

    for (const fs::directory_entry& de : entries)
        std::cout << de << '\n';
}
```

Possible output:

```text
"/home/猫"
"/tmp"
```

## See also

- [`operator<<`](https://en.cppreference.com/w/cpp/filesystem/path/operator_ltltgtgt) (C++17), [`operator>>`](https://en.cppreference.com/w/cpp/filesystem/path/operator_ltltgtgt): performs stream input and output on a quoted path (function)
