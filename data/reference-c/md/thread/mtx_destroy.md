# mtx_destroy

Source: https://en.cppreference.com/w/c/thread/mtx_destroy

```cpp
// Defined in header <threads.h>
void mtx_destroy( mtx_t *mutex ); // (since C11)
```

Destroys the mutex pointed to by `mutex`.

If there are threads waiting on `mutex`, the behavior is undefined.

## Parameters

- `mutex` - pointer to the mutex to destroy

## Return value

(none)

## References

- C17 standard (ISO/IEC 9899:2018):

  - 7.26.4.1 The mtx_destroy function (p: 277)

- C11 standard (ISO/IEC 9899:2011):

  - 7.26.4.1 The mtx_destroy function (p: 380)

## See also

- [C++ documentation for `~mutex`](https://en.cppreference.com/w/cpp/thread/mutex/~mutex)
- [C++ documentation for `~timed_mutex`](https://en.cppreference.com/w/cpp/thread/timed_mutex/~timed_mutex)
- [C++ documentation for `~recursive_mutex`](https://en.cppreference.com/w/cpp/thread/recursive_mutex/~recursive_mutex)
- [C++ documentation for `~recursive_timed_mutex`](https://en.cppreference.com/w/cpp/thread/recursive_timed_mutex/~recursive_timed_mutex)
