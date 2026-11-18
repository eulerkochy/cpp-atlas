# std::generator<Ref,V,Allocator>::promise_type::initial_suspend

Source: https://en.cppreference.com/w/cpp/coroutine/generator/promise_type/initial_suspend

```cpp
std::suspend_always initial_suspend() const noexcept; // (since C++23)
```

Informs that `std::generator` always starts lazily (in suspended state).

Equivalent to `return std::suspend_always{};`.

## Return value

An awaitable object.
