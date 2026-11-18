# std::istreambuf_iterator<CharT,Traits>::istreambuf_iterator

Source: https://en.cppreference.com/w/cpp/iterator/istreambuf_iterator/istreambuf_iterator

```cpp
istreambuf_iterator() throw(); // (1) (until C++11)
constexpr istreambuf_iterator() noexcept; // (1) (since C++11)
constexpr istreambuf_iterator( std::default_sentinel_t ) noexcept; // (2) (since C++20)
istreambuf_iterator( std::basic_istream<CharT,Traits>& is ) throw(); // (3) (until C++11)
istreambuf_iterator( std::basic_istream<CharT,Traits>& is ) noexcept; // (3) (since C++11)
istreambuf_iterator( std::basic_streambuf<CharT,Traits>* s ) throw(); // (4) (until C++11)
istreambuf_iterator( std::basic_streambuf<CharT,Traits>* s ) noexcept; // (4) (since C++11)
istreambuf_iterator( const /* proxy */& p ) throw(); // (5) (until C++11)
istreambuf_iterator( const /* proxy */& p ) noexcept; // (5) (since C++11)
istreambuf_iterator( const istreambuf_iterator& ) noexcept = default; // (6) (since C++11)
```

1,2) Constructs an end-of-stream iterator.

3) Initializes the iterator and stores the value of `is.rdbuf()` in a data member. If `is.rdbuf()` is null, then end-of-stream iterator is constructed.

4) Initializes the iterator and stores the value of `s` in a data member. If `s` is null, then end-of-stream iterator is constructed.

5) Effectively call (3) with the `streambuf_type*` pointer `p` holds.

6) The copy constructor is trivial and explicitly defaulted.

The copy constructor is effectively implicitly declared and not guaranteed to be trivial. (until C++11)

## Parameters

- `is` - stream to obtain the stream buffer from
- `s` - stream buffer to initialize the iterator with
- `p` - object of the implementation-defined proxy type
