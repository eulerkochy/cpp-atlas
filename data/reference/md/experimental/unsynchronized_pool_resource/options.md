# std::experimental::pmr::unsynchronized_pool_resource::options

Source: https://en.cppreference.com/w/cpp/experimental/unsynchronized_pool_resource/options

```cpp
pool_options options() const; // (library fundamentals TS)
```

Returns the options that controls the pooling behavior of this resource.

The values in the returned struct may differ from those supplied to the constructor in the following ways:

- Values of zero will be replaced with implementation-specified defaults;
- Sizes may be rounded to an unspecified granularity.

## See also

- [(constructor)](https://en.cppreference.com/w/cpp/experimental/unsynchronized_pool_resource/unsynchronized_pool_resource): constructs an `unsynchronized_pool_resource` (public member function)
