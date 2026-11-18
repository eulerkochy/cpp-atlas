# C++ keyword: and

Source: https://en.cppreference.com/w/cpp/keyword/and

## Usage

- alternative operators: as an alternative for `&&`

## Example

```cpp
int main()
{
    static_assert((false and false) == false);
    static_assert((false and true)  == false);
    static_assert((true  and false) == false);
    static_assert((true  and true)  == true);
}
```

## See also

- [`and_eq`](https://en.cppreference.com/w/cpp/keyword/and_eq)
- [`bitand`](https://en.cppreference.com/w/cpp/keyword/bitand), [`bitor`](https://en.cppreference.com/w/cpp/keyword/bitor)
- [`not`](https://en.cppreference.com/w/cpp/keyword/not), [`not_eq`](https://en.cppreference.com/w/cpp/keyword/not_eq)
- [`or`](https://en.cppreference.com/w/cpp/keyword/or), [`or_eq`](https://en.cppreference.com/w/cpp/keyword/or_eq)
- [`xor`](https://en.cppreference.com/w/cpp/keyword/xor), [`xor_eq`](https://en.cppreference.com/w/cpp/keyword/xor_eq)
