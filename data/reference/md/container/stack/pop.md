# std::stack<T,Container>::pop

Source: https://en.cppreference.com/w/cpp/container/stack/pop

```cpp
void pop();
```

Removes the top element from the stack. Effectively calls `c.pop_back()`.

## Parameters

(none)

## Return value

(none)

## Complexity

Equal to the complexity of `Container::pop_back`.

## Example

## See also

- [`emplace`](https://en.cppreference.com/w/cpp/container/stack/emplace) (C++11): constructs element in-place at the top (public member function)
- [`push`](https://en.cppreference.com/w/cpp/container/stack/push): inserts element at the top (public member function)
- [`top`](https://en.cppreference.com/w/cpp/container/stack/top): accesses the top element (public member function)
