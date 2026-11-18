# std::messages<CharT>::messages

Source: https://en.cppreference.com/w/cpp/locale/messages/messages

```cpp
// Defined in header <locale>
explicit messages( std::size_t refs = 0 );
```

Creates a `std::messages` facet and forwards the starting reference count `refs` to the base class constructor, `locale::facet::facet()`.

## Parameters

- `refs` - starting reference count
