# C++ identifier with special meaning: import (since C++20)

Source: https://en.cppreference.com/w/cpp/identifier_with_special_meaning/import

## Usage

- `module` *import declaration*: imports a set of translation units

## Example

```cpp
export module foo;

import bar;   // imports all module interface units of module bar
import :baz;  // imports the so-named module partition baz of module foo
import <set>; // imports a synthesized header unit formed from header <set>
```

## See also

- [`export`](https://en.cppreference.com/w/cpp/keyword/export), [`module`](https://en.cppreference.com/w/cpp/identifier_with_special_meaning/module)
