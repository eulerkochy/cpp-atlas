# std::num_get<CharT,InputIt>::num_get

Source: https://en.cppreference.com/w/cpp/locale/num_get/num_get

```cpp
// Defined in header <locale>
explicit num_get( std::size_t refs = 0 );
```

Creates a `std::num_get` facet and forwards the starting reference count `refs` to the base class constructor, `locale::facet::facet()`.

## Parameters

- `refs` - starting reference count
