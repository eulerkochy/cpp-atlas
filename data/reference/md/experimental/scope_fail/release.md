# std::experimental::scope_fail<EF>::release

Source: https://en.cppreference.com/w/cpp/experimental/scope_fail/release

```cpp
void release() noexcept; // (library fundamentals TS v3)
```

Makes the `scope_fail` inactive.

Once a `scope_fail` is inactive, it cannot become active again, and will not call its exit function on destruction.

## Parameters

(none)

## Return value

(none)

## Notes

`release` may be either manually called or automatically called by `scope_fail`'s move constructor.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [(constructor)](https://en.cppreference.com/w/cpp/experimental/scope_fail/scope_fail): constructs a new `scope_fail` (public member function)
- [(destructor)](https://en.cppreference.com/w/cpp/experimental/scope_fail/~scope_fail): calls the exit function when the scope is exited via an exception if the `scope_fail` is active, then destroys the `scope_fail` (public member function)
