#pragma once

#include <chess/bitboard.hpp>
#include <chess/types.hpp>

#include <algorithm>
#include <array>
#include <charconv>
#include <cstdint>
#include <expected>
#include <string>
#include <string_view>
#include <vector>

namespace chess {

inline constexpr std::string_view STARTPOS_FEN =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

namespace detail {

constexpr std::uint64_t splitmix64_next(std::uint64_t& state) noexcept {
    std::uint64_t z = (state += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

struct ZobristTables {
    std::array<std::array<std::uint64_t, 64>, 12> piece_keys{};
    std::array<std::uint64_t, 16> castling_keys{};
    std::array<std::uint64_t, 8> ep_file_keys{};
    std::uint64_t side_key = 0;

    constexpr ZobristTables() noexcept {
        std::uint64_t rng = 0x123456789ABCDEF0ULL;
        for (int p = 0; p < 12; ++p) {
            for (int sq = 0; sq < 64; ++sq) {
                piece_keys[p][sq] = splitmix64_next(rng);
            }
        }
        for (int c = 0; c < 16; ++c) {
            castling_keys[c] = splitmix64_next(rng);
        }
        for (int f = 0; f < 8; ++f) {
            ep_file_keys[f] = splitmix64_next(rng);
        }
        side_key = splitmix64_next(rng);
    }
};

inline constexpr ZobristTables ZOBRIST{};

constexpr std::array<std::uint8_t, 64> make_castling_mask() noexcept {
    std::array<std::uint8_t, 64> mask{};
    mask.fill(ALL_CASTLING);
    mask[A1] = static_cast<std::uint8_t>(ALL_CASTLING & ~WHITE_OOO);
    mask[E1] = static_cast<std::uint8_t>(ALL_CASTLING & ~(WHITE_OO | WHITE_OOO));
    mask[H1] = static_cast<std::uint8_t>(ALL_CASTLING & ~WHITE_OO);
    mask[A8] = static_cast<std::uint8_t>(ALL_CASTLING & ~BLACK_OOO);
    mask[E8] = static_cast<std::uint8_t>(ALL_CASTLING & ~(BLACK_OO | BLACK_OOO));
    mask[H8] = static_cast<std::uint8_t>(ALL_CASTLING & ~BLACK_OO);
    return mask;
}

inline constexpr auto CASTLING_MASK = make_castling_mask();

}  // namespace detail

class Position {
public:
    Position() noexcept {
        board_.fill(Piece::None);
        hash_ = compute_hash();
        push_history(hash_);
    }

    static std::expected<Position, std::string> from_fen(std::string_view fen) {
        std::vector<std::string_view> tokens;
        tokens.reserve(6);
        std::size_t i = 0;
        while (i < fen.size()) {
            while (i < fen.size() && (fen[i] == ' ' || fen[i] == '\t')) ++i;
            if (i >= fen.size()) break;
            const std::size_t start = i;
            while (i < fen.size() && fen[i] != ' ' && fen[i] != '\t') ++i;
            tokens.push_back(fen.substr(start, i - start));
        }

        if (tokens.size() != 4 && tokens.size() != 6) {
            return std::unexpected("Invalid FEN: expected 4 or 6 fields");
        }

        Position pos;
        pos.clear_history();

        // 1. Piece placement
        const std::string_view placement = tokens[0];
        int rank = 7;
        int file = 0;
        for (std::size_t idx = 0; idx < placement.size(); ++idx) {
            const char ch = placement[idx];
            if (ch == '/') {
                if (file != 8) {
                    return std::unexpected("Invalid FEN: rank does not have 8 squares");
                }
                --rank;
                if (rank < 0) {
                    return std::unexpected("Invalid FEN: too many ranks");
                }
                file = 0;
            } else if (ch >= '1' && ch <= '8') {
                file += (ch - '0');
                if (file > 8) {
                    return std::unexpected("Invalid FEN: rank file sum exceeds 8");
                }
            } else {
                const Piece p = char_to_piece(ch);
                if (p == Piece::None) {
                    return std::unexpected(std::string("Invalid FEN: invalid piece character '") + ch + "'");
                }
                if (file >= 8) {
                    return std::unexpected("Invalid FEN: rank file sum exceeds 8");
                }
                const Square sq = make_square(file, rank);
                pos.put_piece_no_hash(sq, p);
                ++file;
            }
        }
        if (rank != 0 || file != 8) {
            return std::unexpected("Invalid FEN: wrong rank count or incomplete final rank");
        }

        if (popcount(pos.pieces(Color::White, PieceType::King)) != 1) {
            return std::unexpected("Invalid FEN: White must have exactly one king");
        }
        if (popcount(pos.pieces(Color::Black, PieceType::King)) != 1) {
            return std::unexpected("Invalid FEN: Black must have exactly one king");
        }

        // 2. Side to move
        if (tokens[1] == "w") {
            pos.side_to_move_ = Color::White;
        } else if (tokens[1] == "b") {
            pos.side_to_move_ = Color::Black;
        } else {
            return std::unexpected("Invalid FEN: side to move must be 'w' or 'b'");
        }

        // 3. Castling availability
        if (tokens[2] == "-") {
            pos.castling_rights_ = NO_CASTLING;
        } else {
            std::uint8_t rights = NO_CASTLING;
            for (char ch : tokens[2]) {
                std::uint8_t bit = NO_CASTLING;
                switch (ch) {
                case 'K': bit = WHITE_OO; break;
                case 'Q': bit = WHITE_OOO; break;
                case 'k': bit = BLACK_OO; break;
                case 'q': bit = BLACK_OOO; break;
                default:
                    return std::unexpected("Invalid FEN: invalid castling character");
                }
                if ((rights & bit) != 0) {
                    return std::unexpected("Invalid FEN: duplicate castling character");
                }
                rights |= bit;
            }
            pos.castling_rights_ = rights;
        }

        // 4. En passant target square
        if (tokens[3] == "-") {
            pos.en_passant_ = SQ_NONE;
        } else {
            const auto ep = string_to_square(tokens[3]);
            if (!ep.has_value()) {
                return std::unexpected("Invalid FEN: invalid en passant square");
            }
            const int expected_rank = (pos.side_to_move_ == Color::White) ? 5 : 2;
            if (rank_of(*ep) != expected_rank) {
                return std::unexpected("Invalid FEN: en passant square on invalid rank");
            }
            pos.en_passant_ = *ep;
        }

        // 5 & 6. Halfmove clock & fullmove number
        if (tokens.size() == 6) {
            auto parse_u16 = [](std::string_view sv, std::uint16_t& out) -> bool {
                if (sv.empty()) return false;
                for (char ch : sv) {
                    if (ch < '0' || ch > '9') return false;
                }
                std::uint32_t val = 0;
                const auto [ptr, ec] = std::from_chars(sv.data(), sv.data() + sv.size(), val);
                if (ec != std::errc{} || ptr != sv.data() + sv.size() || val > 65535u) {
                    return false;
                }
                out = static_cast<std::uint16_t>(val);
                return true;
            };

            if (!parse_u16(tokens[4], pos.halfmove_clock_)) {
                return std::unexpected("Invalid FEN: invalid halfmove clock");
            }
            if (!parse_u16(tokens[5], pos.fullmove_number_) || pos.fullmove_number_ == 0) {
                return std::unexpected("Invalid FEN: invalid fullmove number");
            }
        } else {
            pos.halfmove_clock_ = 0;
            pos.fullmove_number_ = 1;
        }

        pos.hash_ = pos.compute_hash();
        pos.push_history(pos.hash_);
        return pos;
    }

    static Position startpos() { return from_fen(STARTPOS_FEN).value(); }

    std::string to_fen() const {
        std::string fen;
        fen.reserve(80);
        for (int rank = 7; rank >= 0; --rank) {
            int empty_run = 0;
            for (int file = 0; file < 8; ++file) {
                const Piece p = board_[make_square(file, rank)];
                if (p == Piece::None) {
                    ++empty_run;
                } else {
                    if (empty_run > 0) {
                        fen.push_back(static_cast<char>('0' + empty_run));
                        empty_run = 0;
                    }
                    fen.push_back(piece_to_char(p));
                }
            }
            if (empty_run > 0) {
                fen.push_back(static_cast<char>('0' + empty_run));
            }
            if (rank > 0) fen.push_back('/');
        }

        fen.push_back(' ');
        fen.push_back(side_to_move_ == Color::Black ? 'b' : 'w');
        fen.push_back(' ');

        if (castling_rights_ == NO_CASTLING) {
            fen.push_back('-');
        } else {
            if (castling_rights_ & WHITE_OO) fen.push_back('K');
            if (castling_rights_ & WHITE_OOO) fen.push_back('Q');
            if (castling_rights_ & BLACK_OO) fen.push_back('k');
            if (castling_rights_ & BLACK_OOO) fen.push_back('q');
        }

        fen.push_back(' ');
        fen += square_to_string(en_passant_);
        fen.push_back(' ');
        fen += std::to_string(halfmove_clock_);
        fen.push_back(' ');
        fen += std::to_string(fullmove_number_);
        return fen;
    }

    Piece piece_at(Square sq) const noexcept {
        return is_valid_square(sq) ? board_[sq] : Piece::None;
    }

    Bitboard pieces() const noexcept { return color_bb_[0] | color_bb_[1]; }

    Bitboard pieces(Color c) const noexcept {
        if (c == Color::White || c == Color::Black) {
            return color_bb_[static_cast<std::uint8_t>(c)];
        }
        return 0;
    }

    Bitboard pieces(PieceType pt) const noexcept {
        if (pt == PieceType::None) return 0;
        return type_bb_[static_cast<std::uint8_t>(pt)];
    }

    Bitboard pieces(Color c, PieceType pt) const noexcept {
        return pieces(c) & pieces(pt);
    }

    Square king_square(Color c) const noexcept {
        return lsb(pieces(c, PieceType::King));
    }

    Color side_to_move() const noexcept { return side_to_move_; }
    std::uint8_t castling_rights() const noexcept { return castling_rights_; }
    Square en_passant_square() const noexcept { return en_passant_; }
    std::uint16_t halfmove_clock() const noexcept { return halfmove_clock_; }
    std::uint16_t fullmove_number() const noexcept { return fullmove_number_; }

    bool is_square_attacked(Square sq, Color by) const noexcept {
        if (!is_valid_square(sq) || (by != Color::White && by != Color::Black)) return false;
        if (pawn_attacks(~by, sq) & pieces(by, PieceType::Pawn)) return true;
        if (knight_attacks(sq) & pieces(by, PieceType::Knight)) return true;
        if (king_attacks(sq) & pieces(by, PieceType::King)) return true;
        const Bitboard occ = pieces();
        if (bishop_attacks(sq, occ) & (pieces(by, PieceType::Bishop) | pieces(by, PieceType::Queen))) {
            return true;
        }
        if (rook_attacks(sq, occ) & (pieces(by, PieceType::Rook) | pieces(by, PieceType::Queen))) {
            return true;
        }
        return false;
    }

    bool in_check() const noexcept {
        if (side_to_move_ != Color::White && side_to_move_ != Color::Black) return false;
        const Square ksq = king_square(side_to_move_);
        if (!is_valid_square(ksq)) return false;
        return is_square_attacked(ksq, ~side_to_move_);
    }

    void make_move(Move m, UndoState& undo) {
        undo.captured = Piece::None;
        undo.castling_rights = castling_rights_;
        undo.en_passant = en_passant_;
        undo.halfmove_clock = halfmove_clock_;
        undo.prev_hash = hash_;

        const Color us = side_to_move_;
        const Color them = ~us;
        const Square from = m.from();
        const Square to = m.to();
        const MoveFlag flag = m.flag();
        const Piece moved = board_[from];

        if (en_passant_ != SQ_NONE) {
            hash_ ^= detail::ZOBRIST.ep_file_keys[file_of(en_passant_)];
            en_passant_ = SQ_NONE;
        }
        hash_ ^= detail::ZOBRIST.castling_keys[castling_rights_ & 0x0Fu];

        ++halfmove_clock_;
        if (type_of(moved) == PieceType::Pawn) {
            halfmove_clock_ = 0;
        }

        if (flag == MoveFlag::EnPassant) {
            const Square cap_sq =
                (us == Color::White) ? static_cast<Square>(to - 8) : static_cast<Square>(to + 8);
            undo.captured = board_[cap_sq];
            remove_piece_hash(cap_sq);
            halfmove_clock_ = 0;
        } else if (m.is_capture()) {
            undo.captured = board_[to];
            if (undo.captured != Piece::None) {
                remove_piece_hash(to);
            }
            halfmove_clock_ = 0;
        }

        remove_piece_hash(from);
        if (m.is_promotion()) {
            put_piece_hash(to, make_piece(us, m.promotion_type()));
        } else {
            put_piece_hash(to, moved);
        }

        if (flag == MoveFlag::DoublePawnPush) {
            en_passant_ =
                (us == Color::White) ? static_cast<Square>(from + 8) : static_cast<Square>(from - 8);
            hash_ ^= detail::ZOBRIST.ep_file_keys[file_of(en_passant_)];
        } else if (flag == MoveFlag::KingCastle) {
            const Square r_from = (us == Color::White) ? H1 : H8;
            const Square r_to = (us == Color::White) ? F1 : F8;
            const Piece rook = board_[r_from];
            remove_piece_hash(r_from);
            put_piece_hash(r_to, rook);
        } else if (flag == MoveFlag::QueenCastle) {
            const Square r_from = (us == Color::White) ? A1 : A8;
            const Square r_to = (us == Color::White) ? D1 : D8;
            const Piece rook = board_[r_from];
            remove_piece_hash(r_from);
            put_piece_hash(r_to, rook);
        }

        castling_rights_ &= detail::CASTLING_MASK[from] & detail::CASTLING_MASK[to];
        hash_ ^= detail::ZOBRIST.castling_keys[castling_rights_ & 0x0Fu];

        side_to_move_ = them;
        hash_ ^= detail::ZOBRIST.side_key;
        if (us == Color::Black) {
            ++fullmove_number_;
        }

        push_history(hash_);
    }

    void unmake_move(Move m, const UndoState& undo) {
        pop_history();
        side_to_move_ = ~side_to_move_;
        const Color us = side_to_move_;
        if (us == Color::Black) {
            --fullmove_number_;
        }

        const Square from = m.from();
        const Square to = m.to();
        const MoveFlag flag = m.flag();

        if (m.is_promotion()) {
            remove_piece_no_hash(to);
            put_piece_no_hash(from, make_piece(us, PieceType::Pawn));
        } else {
            const Piece moved = board_[to];
            remove_piece_no_hash(to);
            put_piece_no_hash(from, moved);
        }

        if (flag == MoveFlag::EnPassant) {
            const Square cap_sq =
                (us == Color::White) ? static_cast<Square>(to - 8) : static_cast<Square>(to + 8);
            put_piece_no_hash(cap_sq, undo.captured);
        } else if (m.is_capture()) {
            if (undo.captured != Piece::None) {
                put_piece_no_hash(to, undo.captured);
            }
        }

        if (flag == MoveFlag::KingCastle) {
            const Square r_from = (us == Color::White) ? H1 : H8;
            const Square r_to = (us == Color::White) ? F1 : F8;
            const Piece rook = board_[r_to];
            remove_piece_no_hash(r_to);
            put_piece_no_hash(r_from, rook);
        } else if (flag == MoveFlag::QueenCastle) {
            const Square r_from = (us == Color::White) ? A1 : A8;
            const Square r_to = (us == Color::White) ? D1 : D8;
            const Piece rook = board_[r_to];
            remove_piece_no_hash(r_to);
            put_piece_no_hash(r_from, rook);
        }

        castling_rights_ = undo.castling_rights;
        en_passant_ = undo.en_passant;
        halfmove_clock_ = undo.halfmove_clock;
        hash_ = undo.prev_hash;
    }

    std::uint64_t hash() const noexcept { return hash_; }

    std::uint64_t compute_hash() const noexcept {
        std::uint64_t h = 0;
        Bitboard occ = pieces();
        while (occ != 0) {
            const Square sq = pop_lsb(occ);
            const Piece p = board_[sq];
            if (p != Piece::None) {
                h ^= detail::ZOBRIST.piece_keys[static_cast<std::uint8_t>(p)][sq];
            }
        }
        h ^= detail::ZOBRIST.castling_keys[castling_rights_ & 0x0Fu];
        if (en_passant_ != SQ_NONE) {
            h ^= detail::ZOBRIST.ep_file_keys[file_of(en_passant_)];
        }
        if (side_to_move_ == Color::Black) {
            h ^= detail::ZOBRIST.side_key;
        }
        return h;
    }

    bool is_repetition(int threshold = 3) const noexcept {
        if (threshold <= 1) return true;
        const std::size_t n = history_len_;
        const std::size_t lookback =
            std::min<std::size_t>(n, static_cast<std::size_t>(halfmove_clock_) + 1);
        int count = 0;
        for (std::size_t i = 0; i < lookback; ++i) {
            if (history_at(n - 1 - i) == hash_) {
                ++count;
                if (count >= threshold) return true;
            }
        }
        return false;
    }

    bool is_fifty_move_draw() const noexcept { return halfmove_clock_ >= 100; }

    bool is_insufficient_material() const noexcept {
        if ((pieces(PieceType::Pawn) | pieces(PieceType::Rook) | pieces(PieceType::Queen)) != 0) {
            return false;
        }
        const Bitboard wb = pieces(Color::White, PieceType::Bishop);
        const Bitboard bb = pieces(Color::Black, PieceType::Bishop);
        const int total_knights =
            popcount(pieces(Color::White, PieceType::Knight) | pieces(Color::Black, PieceType::Knight));
        const int wb_count = popcount(wb);
        const int bb_count = popcount(bb);
        const int total_minors = total_knights + wb_count + bb_count;
        if (total_minors <= 1) return true;
        if (total_minors == 2 && wb_count == 1 && bb_count == 1) {
            const bool w_dark = (wb & DARK_SQUARES) != 0;
            const bool b_dark = (bb & DARK_SQUARES) != 0;
            return w_dark == b_dark;
        }
        return false;
    }

private:
    void put_piece_no_hash(Square sq, Piece p) noexcept {
        if (p == Piece::None || !is_valid_square(sq)) return;
        const std::uint8_t ci = static_cast<std::uint8_t>(color_of(p));
        const std::uint8_t ti = static_cast<std::uint8_t>(type_of(p));
        if (ci >= 2 || ti >= 6) return;
        board_[sq] = p;
        const Bitboard b = square_bb(sq);
        color_bb_[ci] |= b;
        type_bb_[ti] |= b;
    }

    void remove_piece_no_hash(Square sq) noexcept {
        if (!is_valid_square(sq)) return;
        const Piece p = board_[sq];
        if (p == Piece::None) return;
        const std::uint8_t ci = static_cast<std::uint8_t>(color_of(p));
        const std::uint8_t ti = static_cast<std::uint8_t>(type_of(p));
        if (ci >= 2 || ti >= 6) return;
        board_[sq] = Piece::None;
        const Bitboard b = square_bb(sq);
        color_bb_[ci] &= ~b;
        type_bb_[ti] &= ~b;
    }

    void put_piece_hash(Square sq, Piece p) noexcept {
        if (p == Piece::None || !is_valid_square(sq)) return;
        put_piece_no_hash(sq, p);
        hash_ ^= detail::ZOBRIST.piece_keys[static_cast<std::uint8_t>(p)][sq];
    }

    void remove_piece_hash(Square sq) noexcept {
        if (!is_valid_square(sq)) return;
        const Piece p = board_[sq];
        if (p == Piece::None) return;
        hash_ ^= detail::ZOBRIST.piece_keys[static_cast<std::uint8_t>(p)][sq];
        remove_piece_no_hash(sq);
    }

    void clear_history() noexcept {
        history_len_ = 0;
        history_overflow_.clear();
    }

    void push_history(std::uint64_t h) {
        if (history_len_ < history_buf_.size()) {
            history_buf_[history_len_] = h;
        } else {
            history_overflow_.push_back(h);
        }
        ++history_len_;
    }

    void pop_history() noexcept {
        if (history_len_ == 0) return;
        --history_len_;
        if (history_len_ >= history_buf_.size() && !history_overflow_.empty()) {
            history_overflow_.pop_back();
        }
    }

    std::uint64_t history_at(std::size_t idx) const noexcept {
        if (idx < history_buf_.size()) return history_buf_[idx];
        return history_overflow_[idx - history_buf_.size()];
    }

    std::array<Piece, 64> board_{};
    std::array<Bitboard, 2> color_bb_{};
    std::array<Bitboard, 6> type_bb_{};
    Color side_to_move_ = Color::White;
    std::uint8_t castling_rights_ = NO_CASTLING;
    Square en_passant_ = SQ_NONE;
    std::uint16_t halfmove_clock_ = 0;
    std::uint16_t fullmove_number_ = 1;
    std::uint64_t hash_ = 0;
    std::array<std::uint64_t, 512> history_buf_{};
    std::size_t history_len_ = 0;
    std::vector<std::uint64_t> history_overflow_;
};

}  // namespace chess
