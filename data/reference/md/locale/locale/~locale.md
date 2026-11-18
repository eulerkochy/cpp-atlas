# std::locale::~locale

Source: https://en.cppreference.com/w/cpp/locale/locale/~locale

```cpp
~locale();
```

Non-virtual destructor which decrements reference counts of all facets held by `*this`. Those facets whose reference count becomes zero are deleted.

## Return value

(none)

## Example

> Note: This section is incomplete Reason: no example

## See also

- [(constructor)](https://en.cppreference.com/w/cpp/locale/locale/locale): constructs a new locale (public member function)
