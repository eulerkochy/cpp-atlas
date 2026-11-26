#pragma once

#include <chess/position.hpp>
#include <chess/types.hpp>

#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string_view>

namespace chess {

struct MoveList {
    std::array<Move, 256> moves{};
    std::size_t count = 0;

    constexpr void push_back(Move m) noexcept {
        if (count < moves.size()) moves[count++] = m;
    }

    constexpr std::size_t size() const noexcept { return count; }
    constexpr bool empty() const noexcept { return count == 0; }
    constexpr void clear() noexcept { count = 0; }

    constexpr Move* begin() noexcept { return moves.data(); }
    constexpr Move* end() noexcept { return moves.data() + count; }
    constexpr const Move* begin() const noexcept { return moves.data(); }
    constexpr const Move* end() const noexcept { return moves.data() + count; }

    constexpr Move& operator[](std::size_t i) noexcept { return moves[i]; }
    constexpr const Move& operator[](std::size_t i) const noexcept { return moves[i]; }

    constexpr bool contains(Move m) const noexcept {
        for (std::size_t i = 0; i < count; ++i) {
            if (moves[i] == m) return true;
        }
        return false;
    }
};

namespace detail {

inline void push_promotions(MoveList& out, Square from, Square to, bool is_capture) noexcept {
    if (is_capture) {
        out.push_back(Move(from, to, MoveFlag::PromoCaptureQueen));
        out.push_back(Move(from, to, MoveFlag::PromoCaptureRook));
        out.push_back(Move(from, to, MoveFlag::PromoCaptureBishop));
        out.push_back(Move(from, to, MoveFlag::PromoCaptureKnight));
    } else {
        out.push_back(Move(from, to, MoveFlag::PromoQueen));
        out.push_back(Move(from, to, MoveFlag::PromoRook));
        out.push_back(Move(from, to, MoveFlag::PromoBishop));
        out.push_back(Move(from, to, MoveFlag::PromoKnight));
    }
}

template <bool CapturesOnly>
inline void generate_pseudo_legal_impl(const Position& pos, MoveList& out) {
    out.clear();
    const Color us = pos.side_to_move();
    if (us != Color::White && us != Color::Black) return;
    const Color them = ~us;
    const Bitboard occ = pos.pieces();
    const Bitboard empty = ~occ;
    const Bitboard enemies = pos.pieces(them);
    const Bitboard not_ours = ~pos.pieces(us);

    // Pawns
    const Bitboard pawns = pos.pieces(us, PieceType::Pawn);
    const Square ep = pos.en_passant_square();
    if (us == Color::White) {
        if constexpr (!CapturesOnly) {
            Bitboard single = (pawns << 8) & empty;
            Bitboard double_push = ((single & RANK_3) << 8) & empty;
            Bitboard quiet_single = single & ~RANK_8;
            while (quiet_single != 0) {
                const Square to = pop_lsb(quiet_single);
                out.push_back(Move(static_cast<Square>(to - 8), to, MoveFlag::Quiet));
            }
            while (double_push != 0) {
                const Square to = pop_lsb(double_push);
                out.push_back(Move(static_cast<Square>(to - 16), to, MoveFlag::DoublePawnPush));
            }
        }
        Bitboard promo_push = ((pawns << 8) & empty) & RANK_8;
        while (promo_push != 0) {
            const Square to = pop_lsb(promo_push);
            push_promotions(out, static_cast<Square>(to - 8), to, false);
        }

        Bitboard cap_left = ((pawns & ~FILE_A) << 7) & enemies;
        Bitboard cap_right = ((pawns & ~FILE_H) << 9) & enemies;
        Bitboard cap_left_promo = cap_left & RANK_8;
        Bitboard cap_right_promo = cap_right & RANK_8;
        cap_left &= ~RANK_8;
        cap_right &= ~RANK_8;
        while (cap_left != 0) {
            const Square to = pop_lsb(cap_left);
            out.push_back(Move(static_cast<Square>(to - 7), to, MoveFlag::Capture));
        }
        while (cap_right != 0) {
            const Square to = pop_lsb(cap_right);
            out.push_back(Move(static_cast<Square>(to - 9), to, MoveFlag::Capture));
        }
        while (cap_left_promo != 0) {
            const Square to = pop_lsb(cap_left_promo);
            push_promotions(out, static_cast<Square>(to - 7), to, true);
        }
        while (cap_right_promo != 0) {
            const Square to = pop_lsb(cap_right_promo);
            push_promotions(out, static_cast<Square>(to - 9), to, true);
        }
        if (ep != SQ_NONE) {
            Bitboard ep_att = pawn_attacks(Color::Black, ep) & pawns;
            while (ep_att != 0) {
                const Square from = pop_lsb(ep_att);
                out.push_back(Move(from, ep, MoveFlag::EnPassant));
            }
        }
    } else {
        if constexpr (!CapturesOnly) {
            Bitboard single = (pawns >> 8) & empty;
            Bitboard double_push = ((single & RANK_6) >> 8) & empty;
            Bitboard quiet_single = single & ~RANK_1;
            while (quiet_single != 0) {
                const Square to = pop_lsb(quiet_single);
                out.push_back(Move(static_cast<Square>(to + 8), to, MoveFlag::Quiet));
            }
            while (double_push != 0) {
                const Square to = pop_lsb(double_push);
                out.push_back(Move(static_cast<Square>(to + 16), to, MoveFlag::DoublePawnPush));
            }
        }
        Bitboard promo_push = ((pawns >> 8) & empty) & RANK_1;
        while (promo_push != 0) {
            const Square to = pop_lsb(promo_push);
            push_promotions(out, static_cast<Square>(to + 8), to, false);
        }

        Bitboard cap_left = ((pawns & ~FILE_A) >> 9) & enemies;
        Bitboard cap_right = ((pawns & ~FILE_H) >> 7) & enemies;
        Bitboard cap_left_promo = cap_left & RANK_1;
        Bitboard cap_right_promo = cap_right & RANK_1;
        cap_left &= ~RANK_1;
        cap_right &= ~RANK_1;
        while (cap_left != 0) {
            const Square to = pop_lsb(cap_left);
            out.push_back(Move(static_cast<Square>(to + 9), to, MoveFlag::Capture));
        }
        while (cap_right != 0) {
            const Square to = pop_lsb(cap_right);
            out.push_back(Move(static_cast<Square>(to + 7), to, MoveFlag::Capture));
        }
        while (cap_left_promo != 0) {
            const Square to = pop_lsb(cap_left_promo);
            push_promotions(out, static_cast<Square>(to + 9), to, true);
        }
        while (cap_right_promo != 0) {
            const Square to = pop_lsb(cap_right_promo);
            push_promotions(out, static_cast<Square>(to + 7), to, true);
        }
        if (ep != SQ_NONE) {
            Bitboard ep_att = pawn_attacks(Color::White, ep) & pawns;
            while (ep_att != 0) {
                const Square from = pop_lsb(ep_att);
                out.push_back(Move(from, ep, MoveFlag::EnPassant));
            }
        }
    }

    const Bitboard target_mask = CapturesOnly ? enemies : not_ours;

    auto emit_piece_moves = [&](Bitboard att, Square from) {
        if constexpr (!CapturesOnly) {
            Bitboard quiets = att & empty;
            while (quiets != 0) {
                out.push_back(Move(from, pop_lsb(quiets), MoveFlag::Quiet));
            }
        }
        Bitboard caps = att & enemies;
        while (caps != 0) {
            out.push_back(Move(from, pop_lsb(caps), MoveFlag::Capture));
        }
    };

    // Knights
    Bitboard knights = pos.pieces(us, PieceType::Knight);
    while (knights != 0) {
        const Square from = pop_lsb(knights);
        emit_piece_moves(knight_attacks(from) & target_mask, from);
    }

    // Bishops
    Bitboard bishops = pos.pieces(us, PieceType::Bishop);
    while (bishops != 0) {
        const Square from = pop_lsb(bishops);
        emit_piece_moves(bishop_attacks(from, occ) & target_mask, from);
    }

    // Rooks
    Bitboard rooks = pos.pieces(us, PieceType::Rook);
    while (rooks != 0) {
        const Square from = pop_lsb(rooks);
        emit_piece_moves(rook_attacks(from, occ) & target_mask, from);
    }

    // Queens
    Bitboard queens = pos.pieces(us, PieceType::Queen);
    while (queens != 0) {
        const Square from = pop_lsb(queens);
        emit_piece_moves(queen_attacks(from, occ) & target_mask, from);
    }

    // King
    const Square ksq = pos.king_square(us);
    if (is_valid_square(ksq)) {
        emit_piece_moves(king_attacks(ksq) & target_mask, ksq);

        if constexpr (!CapturesOnly) {
            const std::uint8_t cr = pos.castling_rights();
            if (us == Color::White && ksq == E1) {
                if ((cr & WHITE_OO) != 0 && (occ & (square_bb(F1) | square_bb(G1))) == 0 &&
                    pos.piece_at(H1) == Piece::WhiteRook) {
                    out.push_back(Move(E1, G1, MoveFlag::KingCastle));
                }
                if ((cr & WHITE_OOO) != 0 &&
                    (occ & (square_bb(B1) | square_bb(C1) | square_bb(D1))) == 0 &&
                    pos.piece_at(A1) == Piece::WhiteRook) {
                    out.push_back(Move(E1, C1, MoveFlag::QueenCastle));
                }
            } else if (us == Color::Black && ksq == E8) {
                if ((cr & BLACK_OO) != 0 && (occ & (square_bb(F8) | square_bb(G8))) == 0 &&
                    pos.piece_at(H8) == Piece::BlackRook) {
                    out.push_back(Move(E8, G8, MoveFlag::KingCastle));
                }
                if ((cr & BLACK_OOO) != 0 &&
                    (occ & (square_bb(B8) | square_bb(C8) | square_bb(D8))) == 0 &&
                    pos.piece_at(A8) == Piece::BlackRook) {
                    out.push_back(Move(E8, C8, MoveFlag::QueenCastle));
                }
            }
        }
    }
}

inline bool is_pseudo_move_legal(Position& pos, Move m) {
    const Color us = pos.side_to_move();
    const Color them = ~us;
    const MoveFlag flag = m.flag();

    if (flag == MoveFlag::KingCastle) {
        const Square e = (us == Color::White) ? E1 : E8;
        const Square f = (us == Color::White) ? F1 : F8;
        const Square g = (us == Color::White) ? G1 : G8;
        return !pos.is_square_attacked(e, them) && !pos.is_square_attacked(f, them) &&
               !pos.is_square_attacked(g, them);
    }
    if (flag == MoveFlag::QueenCastle) {
        const Square e = (us == Color::White) ? E1 : E8;
        const Square d = (us == Color::White) ? D1 : D8;
        const Square c = (us == Color::White) ? C1 : C8;
        return !pos.is_square_attacked(e, them) && !pos.is_square_attacked(d, them) &&
               !pos.is_square_attacked(c, them);
    }

    UndoState undo;
    pos.make_move(m, undo);
    const Square ksq = pos.king_square(us);
    const bool legal = is_valid_square(ksq) && !pos.is_square_attacked(ksq, them);
    pos.unmake_move(m, undo);
    return legal;
}

}  // namespace detail

inline void generate_pseudo_legal_moves(const Position& pos, MoveList& out) {
    detail::generate_pseudo_legal_impl<false>(pos, out);
}

inline void generate_legal_moves(Position& pos, MoveList& out) {
    MoveList pseudo;
    detail::generate_pseudo_legal_impl<false>(pos, pseudo);
    out.clear();
    for (const Move m : pseudo) {
        if (detail::is_pseudo_move_legal(pos, m)) {
            out.push_back(m);
        }
    }
}

inline void generate_legal_captures(Position& pos, MoveList& out) {
    MoveList pseudo;
    detail::generate_pseudo_legal_impl<true>(pos, pseudo);
    out.clear();
    for (const Move m : pseudo) {
        if (detail::is_pseudo_move_legal(pos, m)) {
            out.push_back(m);
        }
    }
}

inline std::optional<Move> parse_uci_move(Position& pos, std::string_view uci) {
    if (uci.size() != 4 && uci.size() != 5) return std::nullopt;
    const auto from = string_to_square(uci.substr(0, 2));
    const auto to = string_to_square(uci.substr(2, 2));
    if (!from.has_value() || !to.has_value()) return std::nullopt;

    PieceType promo = PieceType::None;
    if (uci.size() == 5) {
        switch (uci[4]) {
        case 'n': promo = PieceType::Knight; break;
        case 'b': promo = PieceType::Bishop; break;
        case 'r': promo = PieceType::Rook; break;
        case 'q': promo = PieceType::Queen; break;
        default: return std::nullopt;
        }
    }

    MoveList legal;
    generate_legal_moves(pos, legal);
    for (const Move m : legal) {
        if (m.from() == *from && m.to() == *to && m.promotion_type() == promo) {
            return m;
        }
    }
    return std::nullopt;
}

inline std::uint64_t perft(Position& pos, int depth) {
    if (depth <= 0) return 1;
    MoveList legal;
    generate_legal_moves(pos, legal);
    if (depth == 1) return static_cast<std::uint64_t>(legal.size());

    std::uint64_t nodes = 0;
    UndoState undo;
    for (const Move m : legal) {
        pos.make_move(m, undo);
        nodes += perft(pos, depth - 1);
        pos.unmake_move(m, undo);
    }
    return nodes;
}

}  // namespace chess
