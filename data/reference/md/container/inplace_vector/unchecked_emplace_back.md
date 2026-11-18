# std::inplace_vector<T,N>::unchecked_emplace_back

Source: https://en.cppreference.com/w/cpp/container/inplace_vector/unchecked_emplace_back

```cpp
template< class... Args >
constexpr reference unchecked_emplace_back( Args&&... args ); // (since C++26)
```

Appends a new element to the end of the container. Typically, the element is constructed using placement-`new` to construct the element in-place at the location provided by the container. The arguments `args...` are forwarded to the constructor as `std::forward<Args>(args)...`. Equivalent to `return *try_emplace_back(std::forward<Args>(args)...);`.

Before the call to this function `size() < capacity()` must be `true`. Otherwise, the behavior is undefined.

No iterators or references are invalidated, except `end()`, which is invalidated if the insertion occurs.

## Parameters

- `args` - arguments to forward to the constructor of the element

**Type requirements**

- `T` must be *EmplaceConstructible* into `inplace_vector` from `std::forward<Args>(args)...`.

## Return value

`back()`, i.e. a reference to the inserted element.

## Complexity

Constant.

## Exceptions

Any exception thrown by initialization of inserted element. If an exception is thrown for any reason, this function has no effect (strong exception safety guarantee).

## Notes

> Note: This section is incomplete Reason: Explain the purpose of this API.

## Example

```cpp
#include <inplace_vector>
#include <new>
#include <print>
#include <string>
#include <utility>

int main()
{
    std::inplace_vector<std::pair<std::string, std::string>, 2> fauna;
    std::string dog{"\N{DOG}"};

    fauna.unchecked_emplace_back("\N{CAT}", dog);
    fauna.unchecked_emplace_back("\N{CAT}", std::move(dog));
    std::println("fauna = {}", fauna);

    // fauna.unchecked_emplace_back("BUG", "BUG"); // undefined behavior: no space
}
```

Output:

```text
fauna = [("🐈", "🐕"), ("🐈", "🐕")]
```

## See also

- [`emplace_back`](https://en.cppreference.com/w/cpp/container/inplace_vector/emplace_back): constructs an element in-place at the end (public member function)
- [`append_range`](https://en.cppreference.com/w/cpp/container/inplace_vector/append_range): adds a range of elements to the end (public member function)
- [`push_back`](https://en.cppreference.com/w/cpp/container/inplace_vector/push_back): adds an element to the end (public member function)
- [`try_push_back`](https://en.cppreference.com/w/cpp/container/inplace_vector/try_push_back): tries to add an element to the end (public member function)
- [`try_emplace_back`](https://en.cppreference.com/w/cpp/container/inplace_vector/try_emplace_back): tries to construct an element in-place at the end (public member function)
- [`try_append_range`](https://en.cppreference.com/w/cpp/container/inplace_vector/try_append_range): tries to add a range of elements to the end (public member function)
- [`unchecked_push_back`](https://en.cppreference.com/w/cpp/container/inplace_vector/unchecked_push_back): unconditionally adds an element to the end (public member function)
- [`pop_back`](https://en.cppreference.com/w/cpp/container/inplace_vector/pop_back): removes the last element (public member function)
- [`back_inserter`](https://en.cppreference.com/w/cpp/iterator/back_inserter): creates a `std::back_insert_iterator` of type inferred from the argument (function template)
