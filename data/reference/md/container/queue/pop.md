# std::queue<T,Container>::pop

Source: https://en.cppreference.com/w/cpp/container/queue/pop

```cpp
void pop();
```

Removes an element from the front of the queue. Effectively calls `c.pop_front()`.

## Parameters

(none)

## Return value

(none)

## Complexity

Equal to the complexity of `Container::pop_front`.

## Example

## See also

- [`emplace`](https://en.cppreference.com/w/cpp/container/queue/emplace) (C++11): constructs element in-place at the end (public member function)
- [`push`](https://en.cppreference.com/w/cpp/container/queue/push): inserts element at the end (public member function)
- [`front`](https://en.cppreference.com/w/cpp/container/queue/front): access the first element (public member function)
