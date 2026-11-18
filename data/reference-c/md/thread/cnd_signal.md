# cnd_signal

Source: https://en.cppreference.com/w/c/thread/cnd_signal

```cpp
// Defined in header <threads.h>
int cnd_signal( cnd_t *cond ); // (since C11)
```

Unblocks one thread that currently waits on condition variable pointed to by `cond`. If no threads are blocked, does nothing and returns `thrd_success`.

## Parameters

- `cond` - pointer to a condition variable

## Return value

`thrd_success` if successful, `thrd_error` otherwise.

## References

- C17 standard (ISO/IEC 9899:2018):

  - 7.26.3.4 The cnd_signal function (p: 276)

- C11 standard (ISO/IEC 9899:2011):

  - 7.26.3.4 The cnd_signal function (p: 379)

## See also

- [`cnd_broadcast`](https://en.cppreference.com/w/c/thread/cnd_broadcast) (C11): unblocks all threads blocked on a condition variable (function)
- [C++ documentation for `condition_variable::notify_one`](https://en.cppreference.com/w/cpp/thread/condition_variable/notify_one)
- [C++ documentation for `condition_variable_any::notify_one`](https://en.cppreference.com/w/cpp/thread/condition_variable_any/notify_one)
