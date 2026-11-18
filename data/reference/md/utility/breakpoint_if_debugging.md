# std::breakpoint_if_debugging

Source: https://en.cppreference.com/w/cpp/utility/breakpoint_if_debugging

```cpp
// Defined in header <debugging>
void breakpoint_if_debugging() noexcept; // (since C++26)
```

Conditional breakpoint: attempts to temporarily halt the execution of the program and transfer control to the debugger if it were able to determine that the debugger is present. Acts as a no-op otherwise.

Formally, the behavior of this function is completely implementation-defined. Equivalent to `if (std::is_debugger_present()) std::breakpoint();`.

## Notes

| Feature-test macro | Value | Std | Feature |
| --- | --- | --- | --- |
| `__cpp_lib_debugging` | `202311L` | (C++26) | Debugging support library |
| `__cpp_lib_debugging` | `202403L` | (C++26) | Replaceable `std::is_debugger_present` |

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`is_debugger_present`](https://en.cppreference.com/w/cpp/utility/is_debugger_present) (C++26): checks whether a program is running under the control of a debugger (function)
- [`breakpoint`](https://en.cppreference.com/w/cpp/utility/breakpoint) (C++26): pauses the running program when called (function)
