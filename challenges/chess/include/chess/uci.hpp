#pragma once

#include <chess/position.hpp>
#include <chess/search.hpp>

#include <istream>
#include <ostream>
#include <string>
#include <string_view>

namespace chess {

class UciEngine {
public:
    explicit UciEngine(std::ostream& out) : out_(out) {}

    bool process_line(std::string_view line) {
        (void)out_;
        if (line == "quit") return false;
        return true;
    }

    void loop(std::istream& in) {
        std::string line;
        while (std::getline(in, line)) {
            if (!process_line(line)) break;
        }
    }

    const Position& position() const noexcept { return pos_; }

private:
    std::ostream& out_;
    Position pos_;
    Searcher searcher_;
};

}  // namespace chess
