#pragma once

#include <chess/position.hpp>
#include <chess/search.hpp>

#include <algorithm>
#include <charconv>
#include <cctype>
#include <cstdlib>
#include <istream>
#include <ostream>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

namespace chess {

class UciEngine {
public:
    explicit UciEngine(std::ostream& out) : out_(out), pos_(Position::startpos()) {}

    bool process_line(std::string_view line) {
        if (!line.empty() && line.back() == '\r') {
            line.remove_suffix(1);
        }

        std::vector<std::string_view> tokens;
        std::size_t i = 0;
        while (i < line.size()) {
            while (i < line.size() && (line[i] == ' ' || line[i] == '\t')) ++i;
            if (i >= line.size()) break;
            const std::size_t start = i;
            while (i < line.size() && line[i] != ' ' && line[i] != '\t') ++i;
            tokens.push_back(line.substr(start, i - start));
        }

        if (tokens.empty()) return true;

        const std::string_view cmd = tokens[0];
        if (cmd == "quit") {
            searcher_.request_stop();
            return false;
        }
        if (cmd == "stop") {
            searcher_.request_stop();
            return true;
        }
        if (cmd == "uci") {
            out_ << "id name CppAtlasChess\n"
                 << "id author CppAtlas\n"
                 << "option name Hash type spin default 16 min 1 max 1024\n"
                 << "uciok\n";
            out_.flush();
            return true;
        }
        if (cmd == "isready") {
            out_ << "readyok\n";
            out_.flush();
            return true;
        }
        if (cmd == "ucinewgame") {
            searcher_.clear_tt();
            pos_ = Position::startpos();
            return true;
        }
        if (cmd == "setoption") {
            handle_setoption(tokens);
            return true;
        }
        if (cmd == "position") {
            handle_position(tokens);
            return true;
        }
        if (cmd == "go") {
            handle_go(tokens);
            return true;
        }

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
    static bool iequals(std::string_view a, std::string_view b) noexcept {
        if (a.size() != b.size()) return false;
        for (std::size_t idx = 0; idx < a.size(); ++idx) {
            const auto ca = static_cast<unsigned char>(a[idx]);
            const auto cb = static_cast<unsigned char>(b[idx]);
            if (std::tolower(ca) != std::tolower(cb)) return false;
        }
        return true;
    }

    template <typename Int>
    static bool parse_int(std::string_view sv, Int& out) noexcept {
        if (sv.empty()) return false;
        const auto [ptr, ec] = std::from_chars(sv.data(), sv.data() + sv.size(), out);
        return ec == std::errc{} && ptr == sv.data() + sv.size();
    }

    void handle_setoption(const std::vector<std::string_view>& tokens) {
        std::string name;
        std::string value;
        bool in_name = false;
        bool in_value = false;
        for (std::size_t idx = 1; idx < tokens.size(); ++idx) {
            if (tokens[idx] == "name") {
                in_name = true;
                in_value = false;
            } else if (tokens[idx] == "value") {
                in_name = false;
                in_value = true;
            } else if (in_name) {
                if (!name.empty()) name.push_back(' ');
                name += tokens[idx];
            } else if (in_value) {
                if (!value.empty()) value.push_back(' ');
                value += tokens[idx];
            }
        }
        if (iequals(name, "Hash")) {
            std::size_t mb = 16;
            if (parse_int(value, mb)) {
                searcher_.resize_tt(mb);
            }
        }
    }

    void handle_position(const std::vector<std::string_view>& tokens) {
        if (tokens.size() < 2) return;
        std::size_t idx = 1;
        if (tokens[idx] == "startpos") {
            pos_ = Position::startpos();
            ++idx;
        } else if (tokens[idx] == "fen") {
            ++idx;
            std::string fen;
            while (idx < tokens.size() && tokens[idx] != "moves") {
                if (!fen.empty()) fen.push_back(' ');
                fen += tokens[idx];
                ++idx;
            }
            if (auto parsed = Position::from_fen(fen); parsed.has_value()) {
                pos_ = std::move(*parsed);
            } else {
                return;
            }
        } else {
            return;
        }

        if (idx < tokens.size() && tokens[idx] == "moves") {
            ++idx;
            UndoState undo;
            for (; idx < tokens.size(); ++idx) {
                if (auto m = parse_uci_move(pos_, tokens[idx]); m.has_value()) {
                    pos_.make_move(*m, undo);
                } else {
                    break;
                }
            }
        }
    }

    void handle_go(const std::vector<std::string_view>& tokens) {
        SearchLimits limits;
        bool has_depth = false;
        bool has_movetime = false;
        bool has_nodes = false;
        bool has_infinite = false;
        std::int64_t wtime = -1;
        std::int64_t btime = -1;
        std::int64_t winc = 0;
        std::int64_t binc = 0;
        std::int64_t movestogo = 30;

        for (std::size_t idx = 1; idx < tokens.size(); ++idx) {
            const std::string_view tok = tokens[idx];
            if (tok == "depth" && idx + 1 < tokens.size()) {
                int d = 64;
                if (parse_int(tokens[++idx], d)) {
                    limits.max_depth = std::max(1, d);
                    has_depth = true;
                }
            } else if (tok == "movetime" && idx + 1 < tokens.size()) {
                std::int64_t ms = 0;
                if (parse_int(tokens[++idx], ms)) {
                    limits.movetime_ms = std::max<std::int64_t>(1, ms);
                    has_movetime = true;
                }
            } else if (tok == "nodes" && idx + 1 < tokens.size()) {
                std::uint64_t n = 0;
                if (parse_int(tokens[++idx], n)) {
                    limits.max_nodes = n;
                    has_nodes = true;
                }
            } else if (tok == "wtime" && idx + 1 < tokens.size()) {
                parse_int(tokens[++idx], wtime);
            } else if (tok == "btime" && idx + 1 < tokens.size()) {
                parse_int(tokens[++idx], btime);
            } else if (tok == "winc" && idx + 1 < tokens.size()) {
                parse_int(tokens[++idx], winc);
            } else if (tok == "binc" && idx + 1 < tokens.size()) {
                parse_int(tokens[++idx], binc);
            } else if (tok == "movestogo" && idx + 1 < tokens.size()) {
                std::int64_t mtg = 30;
                if (parse_int(tokens[++idx], mtg) && mtg > 0) {
                    movestogo = mtg;
                }
            } else if (tok == "infinite") {
                has_infinite = true;
            }
        }

        if (!has_movetime && !has_depth && !has_nodes && !has_infinite) {
            const std::int64_t my_time =
                (pos_.side_to_move() == Color::White) ? wtime : btime;
            const std::int64_t my_inc =
                (pos_.side_to_move() == Color::White) ? winc : binc;
            if (my_time >= 0) {
                std::int64_t alloc = my_time / movestogo + my_inc / 2;
                alloc = std::clamp<std::int64_t>(alloc, 10, std::max<std::int64_t>(10, my_time / 2));
                limits.movetime_ms = alloc;
            } else {
                limits.max_depth = 6;
            }
        }

        const SearchResult res = searcher_.search(pos_, limits, [this](const SearchInfo& info) {
            out_ << "info depth " << info.depth << " score ";
            if (std::abs(info.score) > MATE_THRESHOLD) {
                const int plies = MATE_SCORE - std::abs(info.score);
                const int mate_moves = std::max(1, (plies + 1) / 2);
                out_ << "mate " << (info.score > 0 ? mate_moves : -mate_moves);
            } else {
                out_ << "cp " << info.score;
            }
            out_ << " nodes " << info.nodes << " time " << info.time_ms;
            if (!info.pv.empty()) {
                out_ << " pv";
                for (const Move m : info.pv) {
                    out_ << ' ' << m.to_uci();
                }
            }
            out_ << '\n';
            out_.flush();
        });

        out_ << "bestmove " << res.best_move.to_uci() << '\n';
        out_.flush();
    }

    std::ostream& out_;
    Position pos_;
    Searcher searcher_;
};

}  // namespace chess
