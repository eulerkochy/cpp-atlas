# std::stop_source::~stop_source

Source: https://en.cppreference.com/w/cpp/thread/stop_source/~stop_source

```cpp
~stop_source(); // (since C++20)
```

Destroys the `stop_source` object.

If `*this` has associated stop-state, releases ownership of it.
