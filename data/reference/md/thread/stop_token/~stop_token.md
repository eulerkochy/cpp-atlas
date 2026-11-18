# std::stop_token::~stop_token

Source: https://en.cppreference.com/w/cpp/thread/stop_token/~stop_token

```cpp
~stop_token(); // (since C++20)
```

Destroys the `stop_token` object.

If `*this` has associated stop-state, releases ownership of it.
