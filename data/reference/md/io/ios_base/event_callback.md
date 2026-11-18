# std::ios_base::event_callback

Source: https://en.cppreference.com/w/cpp/io/ios_base/event_callback

```cpp
typedef void ( *event_callback )( event type, ios_base& ios, int index );
```

The type of function callbacks that can be registered using `register_callback()` to be called on specific events.

`type` is a value of type `ios_base::event` which indicates the type of the event that will invoke this callback.

`ios` refers to the stream object for which the callback is invoked: `*this` is passed as the argument when callbacks are invoked by `std::ios_base` and `std::basic_ios` member functions.

`index` is the user-provided value passed to `register_callback()` when registering the function.

## See also

- [`copyfmt`](https://en.cppreference.com/w/cpp/io/basic_ios/copyfmt): copies formatting information (public member function of `std::basic_ios<CharT,Traits>`)
- [`imbue`](https://en.cppreference.com/w/cpp/io/ios_base/imbue): sets locale (public member function)
- [(destructor)](https://en.cppreference.com/w/cpp/io/ios_base/~ios_base) [virtual]: destructs the object (virtual public member function)
- [`register_callback`](https://en.cppreference.com/w/cpp/io/ios_base/register_callback): registers event callback function (public member function)
