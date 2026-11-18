# std::ctype<CharT>::ctype

Source: https://en.cppreference.com/w/cpp/locale/ctype/ctype

```cpp
// Defined in header <locale>
explicit ctype( std::size_t refs = 0 );
```

Creates a `std::ctype` facet and forwards the starting reference count `refs` to the base class constructor, `locale::facet::facet()`.

## Parameters

- `refs` - starting reference count
