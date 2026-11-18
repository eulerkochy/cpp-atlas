# std::unordered_multiset<Key,Hash,KeyEqual,Allocator>::bucket_count

Source: https://en.cppreference.com/w/cpp/container/unordered_multiset/bucket_count

```cpp
size_type bucket_count() const; // (since C++11)
```

Returns the number of buckets in the container.

## Parameters

(none)

## Return value

The number of buckets in the container.

## Complexity

Constant.

## See also

- [`bucket_size`](https://en.cppreference.com/w/cpp/container/unordered_multiset/bucket_size): returns the number of elements in specific bucket (public member function)
- [`max_bucket_count`](https://en.cppreference.com/w/cpp/container/unordered_multiset/max_bucket_count): returns the maximum number of buckets (public member function)
