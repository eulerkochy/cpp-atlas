#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace chess {

enum class Color : std::uint8_t { White = 0, Black = 1, None = 2 };

constexpr Color operator~(Color c) noexcept {
    return c == Color::White ? Color::Black : (c == Color::Black ? Color::White : Color::None);
}

enum class PieceType : std::uint8_t {
    Pawn = 0,
    Knight = 1,
    Bishop = 2,
    Rook = 3,
    Queen = 4,
    King = 5,
    None = 6
};

enum class Piece : std::uint8_t {
    WhitePawn = 0,
    WhiteKnight,
    WhiteBishop,
    WhiteRook,
    WhiteQueen,
    WhiteKing,
    BlackPawn,
    BlackKnight,
    BlackBishop,
    BlackRook,
    BlackQueen,
    BlackKing,
    None = 12
};

constexpr Piece make_piece(Color c, PieceType pt) noexcept {
    if (c == Color::None || pt == PieceType::None) return Piece::None;
    return static_cast<Piece>(static_cast<std::uint8_t>(c) * 6 + static_cast<std::uint8_t>(pt));
}

constexpr Color color_of(Piece p) noexcept {
    if (p == Piece::None) return Color::None;
    return static_cast<std::uint8_t>(p) < 6 ? Color::White : Color::Black;
}

constexpr PieceType type_of(Piece p) noexcept {
    if (p == Piece::None) return PieceType::None;
    return static_cast<PieceType>(static_cast<std::uint8_t>(p) % 6);
}

constexpr char piece_to_char(Piece p) noexcept {
    switch (p) {
    case Piece::WhitePawn: return 'P';
    case Piece::WhiteKnight: return 'N';
    case Piece::WhiteBishop: return 'B';
    case Piece::WhiteRook: return 'R';
    case Piece::WhiteQueen: return 'Q';
    case Piece::WhiteKing: return 'K';
    case Piece::BlackPawn: return 'p';
    case Piece::BlackKnight: return 'n';
    case Piece::BlackBishop: return 'b';
    case Piece::BlackRook: return 'r';
    case Piece::BlackQueen: return 'q';
    case Piece::BlackKing: return 'k';
    case Piece::None: return '.';
    }
    return '.';
}

constexpr Piece char_to_piece(char ch) noexcept {
    switch (ch) {
    case 'P': return Piece::WhitePawn;
    case 'N': return Piece::WhiteKnight;
    case 'B': return Piece::WhiteBishop;
    case 'R': return Piece::WhiteRook;
    case 'Q': return Piece::WhiteQueen;
    case 'K': return Piece::WhiteKing;
    case 'p': return Piece::BlackPawn;
    case 'n': return Piece::BlackKnight;
    case 'b': return Piece::BlackBishop;
    case 'r': return Piece::BlackRook;
    case 'q': return Piece::BlackQueen;
    case 'k': return Piece::BlackKing;
    default: return Piece::None;
    }
}

using Square = std::uint8_t;
inline constexpr Square SQ_NONE = 64;

inline constexpr Square A1 = 0, B1 = 1, C1 = 2, D1 = 3, E1 = 4, F1 = 5, G1 = 6, H1 = 7;
inline constexpr Square A2 = 8, B2 = 9, C2 = 10, D2 = 11, E2 = 12, F2 = 13, G2 = 14, H2 = 15;
inline constexpr Square A3 = 16, B3 = 17, C3 = 18, D3 = 19, E3 = 20, F3 = 21, G3 = 22, H3 = 23;
inline constexpr Square A4 = 24, B4 = 25, C4 = 26, D4 = 27, E4 = 28, F4 = 29, G4 = 30, H4 = 31;
inline constexpr Square A5 = 32, B5 = 33, C5 = 34, D5 = 35, E5 = 36, F5 = 37, G5 = 38, H5 = 39;
inline constexpr Square A6 = 40, B6 = 41, C6 = 42, D6 = 43, E6 = 44, F6 = 45, G6 = 46, H6 = 47;
inline constexpr Square A7 = 48, B7 = 49, C7 = 50, D7 = 51, E7 = 52, F7 = 53, G7 = 54, H7 = 55;
inline constexpr Square A8 = 56, B8 = 57, C8 = 58, D8 = 59, E8 = 60, F8 = 61, G8 = 62, H8 = 63;

constexpr Square make_square(int file, int rank) noexcept {
    if (file < 0 || file >= 8 || rank < 0 || rank >= 8) return SQ_NONE;
    return static_cast<Square>(rank * 8 + file);
}

constexpr int file_of(Square sq) noexcept { return static_cast<int>(sq & 7); }
constexpr int rank_of(Square sq) noexcept { return static_cast<int>(sq >> 3); }
constexpr bool is_valid_square(Square sq) noexcept { return sq < 64; }

inline std::string square_to_string(Square sq) {
    if (!is_valid_square(sq)) return "-";
    return std::string{static_cast<char>('a' + file_of(sq)), static_cast<char>('1' + rank_of(sq))};
}

inline std::optional<Square> string_to_square(std::string_view s) {
    if (s.size() != 2) return std::nullopt;
    if (s[0] < 'a' || s[0] > 'h' || s[1] < '1' || s[1] > '8') return std::nullopt;
    return make_square(s[0] - 'a', s[1] - '1');
}

enum class MoveFlag : std::uint8_t {
    Quiet = 0,
    DoublePawnPush = 1,
    KingCastle = 2,
    QueenCastle = 3,
    Capture = 4,
    EnPassant = 5,
    PromoKnight = 8,
    PromoBishop = 9,
    PromoRook = 10,
    PromoQueen = 11,
    PromoCaptureKnight = 12,
    PromoCaptureBishop = 13,
    PromoCaptureRook = 14,
    PromoCaptureQueen = 15
};

struct Move {
    std::uint16_t raw = 0;

    constexpr Move() noexcept = default;
    constexpr Move(Square from, Square to, MoveFlag flag = MoveFlag::Quiet) noexcept
        : raw(static_cast<std::uint16_t>((static_cast<std::uint16_t>(from) & 0x3Fu) |
                                         ((static_cast<std::uint16_t>(to) & 0x3Fu) << 6) |
                                         ((static_cast<std::uint16_t>(flag) & 0xFu) << 12))) {}

    constexpr Square from() const noexcept { return static_cast<Square>(raw & 0x3Fu); }
    constexpr Square to() const noexcept { return static_cast<Square>((raw >> 6) & 0x3Fu); }
    constexpr MoveFlag flag() const noexcept { return static_cast<MoveFlag>((raw >> 12) & 0xFu); }

    constexpr bool is_null() const noexcept { return raw == 0; }
    constexpr bool is_capture() const noexcept {
        return (static_cast<std::uint8_t>(flag()) & 0x4u) != 0;
    }
    constexpr bool is_promotion() const noexcept {
        return (static_cast<std::uint8_t>(flag()) & 0x8u) != 0;
    }
    constexpr PieceType promotion_type() const noexcept {
        if (!is_promotion()) return PieceType::None;
        return static_cast<PieceType>((static_cast<std::uint8_t>(flag()) & 0x3u) + 1u);
    }

    constexpr bool operator==(const Move&) const noexcept = default;

    std::string to_uci() const {
        if (is_null()) return "0000";
        std::string s = square_to_string(from()) + square_to_string(to());
        switch (promotion_type()) {
        case PieceType::Knight: s.push_back('n'); break;
        case PieceType::Bishop: s.push_back('b'); break;
        case PieceType::Rook: s.push_back('r'); break;
        case PieceType::Queen: s.push_back('q'); break;
        default: break;
        }
        return s;
    }
};

enum Castling : std::uint8_t {
    NO_CASTLING = 0,
    WHITE_OO = 1,
    WHITE_OOO = 2,
    BLACK_OO = 4,
    BLACK_OOO = 8,
    ALL_CASTLING = 15
};

struct UndoState {
    Piece captured = Piece::None;
    std::uint8_t castling_rights = NO_CASTLING;
    Square en_passant = SQ_NONE;
    std::uint16_t halfmove_clock = 0;
    std::uint64_t prev_hash = 0;
};

}  // namespace chess
