# std::money_get<CharT,InputIt>::money_get

Source: https://en.cppreference.com/w/cpp/locale/money_get/money_get

```cpp
// Defined in header <locale>
explicit money_get( std::size_t refs = 0 );
```

Creates a `std::money_get` facet and forwards the starting reference count `refs` to the base class constructor, `locale::facet::facet()`.

## Parameters

- `refs` - starting reference count
