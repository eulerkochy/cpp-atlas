# strdup

Source: https://en.cppreference.com/w/c/string/byte/strdup

```cpp
// Defined in header <string.h>
char *strdup( const char *src ); // (since C23)
```

Returns a pointer to a null-terminated byte string, which is a duplicate of the string pointed to by `src`. The space for the new string is obtained as if the `malloc` was invoked. The returned pointer must be passed to `free` to avoid a memory leak.

If an error occurs, a null pointer is returned and `errno` might be set.

## Parameters

- `src` - pointer to the null-terminated byte string to duplicate

## Return value

A pointer to the newly allocated string, or a null pointer if an error occurred.

## Notes

The function is identical to the POSIX strdup.

## Example

```c
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    const char *s1 = "Duplicate me!";
    char *s2 = strdup(s1);
    printf("s2 = \"%s\"\n", s2);
    free(s2);
}
```

Output:

```text
s2 = "Duplicate me!"
```

## See also

- [`strndup`](https://en.cppreference.com/w/c/string/byte/strndup) (C23): allocates a copy of a string of specified size (function)
- [`strcpy`](https://en.cppreference.com/w/c/string/byte/strcpy), [`strcpy_s`](https://en.cppreference.com/w/c/string/byte/strcpy) (C11): copies one string to another (function)
- [`malloc`](https://en.cppreference.com/w/c/memory/malloc): allocates memory (function)
- [`free`](https://en.cppreference.com/w/c/memory/free): deallocates previously allocated memory (function)
