# std::basic_iostream<CharT,Traits>::~basic_iostream

Source: https://en.cppreference.com/w/cpp/io/basic_iostream/~basic_iostream

```cpp
virtual ~basic_iostream();
```

Destructs the input/output stream.

## Notes

This destructor does not perform any operation on the underlying stream buffer (`rdbuf()`): the destructors of the derived streams such as `std::basic_fstream` and `std::basic_stringstream` are responsible for calling the destructors of the stream buffers.
