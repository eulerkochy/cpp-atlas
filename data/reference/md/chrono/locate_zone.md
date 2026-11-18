# std::chrono::locate_zone

Source: https://en.cppreference.com/w/cpp/chrono/locate_zone

```cpp
// Defined in header <chrono>
const std::chrono::time_zone* locate_zone( std::string_view tz_name ); // (since C++20)
```

Convenience function for locating a time zone in the time zone database. Equivalent to `std::chrono::get_tzdb().locate_zone(tz_name)`.

## Exceptions

`std::runtime_error` if the specified time zone cannot be found, or if this is the first reference to the time zone database and the time zone database cannot be initialized.

## Notes

A call to this function that is the first reference to the time zone database will cause it to be initialized.

## See also

- [`locate_zone`](https://en.cppreference.com/w/cpp/chrono/tzdb/locate_zone): locate a time zone with the given name (public member function of `std::chrono::tzdb`)
- [`get_tzdb`](https://en.cppreference.com/w/cpp/chrono/tzdb_functions) (C++20), [`get_tzdb_list`](https://en.cppreference.com/w/cpp/chrono/tzdb_functions), [`reload_tzdb`](https://en.cppreference.com/w/cpp/chrono/tzdb_functions), [`remote_version`](https://en.cppreference.com/w/cpp/chrono/tzdb_functions): accesses and controls the global time zone database information (function)
