#include <chess/uci.hpp>

#include <iostream>

int main() {
    chess::UciEngine(std::cout).loop(std::cin);
    return 0;
}
