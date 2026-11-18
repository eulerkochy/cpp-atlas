# std::extents<IndexType,Extents...>::dynamic-index-inv

Source: https://en.cppreference.com/w/cpp/container/mdspan/extents/dynamic-index-inv

```cpp
private:
    static constexpr auto /*dynamic-index-inv*/( rank_type i ) noexcept; // (since C++23) (exposition only*)
```

Returns the number `r` such that in range `[​0​,` `r + 1)` there are exactly `[​0​,` `i + 1)` dynamic extents. If `i <= rank_dynamic()` is `false`, the behavior is undefined.

## Parameters

- `i` - the index

## Return value

The minimum value of `r` such that `dynamic-index(r + 1) == i + 1` is `true`.

## See also

> Note: This section is incomplete
