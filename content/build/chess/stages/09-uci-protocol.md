## Your task

Finish the engine by implementing draw detection on `chess::Position` (in `include/chess/position.hpp`, and hooking draw checks into `Searcher` in `include/chess/search.hpp`) plus the UCI protocol handler `chess::UciEngine` in `include/chess/uci.hpp`:

In `include/chess/position.hpp`:

```cpp
bool is_repetition(int threshold = 3) const noexcept;
bool is_fifty_move_draw() const noexcept;
bool is_insufficient_material() const noexcept;
```

In `include/chess/uci.hpp`:

```cpp
namespace chess {

class UciEngine {
public:
    explicit UciEngine(std::ostream& out) : out_(out) {}

    bool process_line(std::string_view line);
    void loop(std::istream& in);
    const Position& position() const noexcept;
};

} // namespace chess
```

`src/main.cpp` already constructs `chess::UciEngine(std::cout)` and runs `.loop(std::cin)`. Once Stage 9 passes (`./cppatlas submit` or `./cppatlas test 9`), run `./cppatlas run` to chat with your engine over UCI or plug `chess_engine` into any chess GUI (CuteChess, Arena, BanksiaGUI, Lichess-bot).

## Design & C++23 mechanics

Why does UCI use a **stateless** `position ... moves ...` + `go` protocol instead of sending incremental moves one at a time?

- The GUI owns the official game state and sends the full move list from `startpos` or a FEN before every `go` (`position startpos moves e2e4 e7e5 g1f3`). That eliminates desync bugs between GUI and engine, lets the GUI jump backward/forward in a game effortlessly, and lets the engine reconstruct the **exact repetition history** (`is_repetition`) from the start of the game or last irreversible move!
- **Draw detection rules (`position.hpp` and `search.hpp`):**
  - `is_fifty_move_draw()`: returns `halfmove_clock() >= 100` (100 plies = 50 full moves without a pawn push or capture).
  - `is_repetition(int threshold = 3)`: count how many times `hash_` appears in the position's Zobrist history (bounded back by `halfmove_clock_` plies, since pawn pushes and captures are irreversible). Return `count >= threshold`. Inside search, check `is_repetition(2)` (twofold repetition inside the search tree already detects a forced draw loop!).
  - `is_insufficient_material()`: return `true` for `K vs K`, `K+N vs K`, `K+B vs K`, and `K+B vs K+B` when both bishops stand on the **same square color** (`(file + rank) % 2`), and `false` whenever any pawn, rook, queen, or opposite-color bishops remain.
- **UCI command parsing (`uci.hpp`):**
  - `uci` → print `id name ...`, `id author ...`, `option name Hash type spin default 16 min 1 max 1024`, and `uciok`.
  - `isready` → print `readyok`.
  - `ucinewgame` → call `searcher_.clear_tt()` and reset `pos_ = Position::startpos()`.
  - `setoption name Hash value N` → resize the transposition table via `searcher_.resize_tt(N)`.
  - `position startpos [moves ...]` and `position fen <6-token-fen> [moves ...]` → set `pos_`, then apply each move token via `parse_uci_move(pos_, tok)` and `pos_.make_move(m, undo)` (storing `UndoState` or keeping `Position`'s internal hash history updated).
  - `go [depth N] [movetime ms] [nodes N] [wtime ms] [btime ms] [winc ms] [binc ms] [movestogo N]` → compute `SearchLimits` (if `wtime`/`btime` are given without `depth`/`movetime`, allocate e.g. `time / 25 + inc / 2`), call `searcher_.search(...)` streaming `info depth ... score cp <v> | mate <m> nodes ... time ... pv ...`, then output `bestmove <uci>` (or `bestmove 0000` if null).
  - `stop` → `searcher_.request_stop()`.
  - `quit` → return `false` so `loop()` terminates cleanly.
  - Always flush `out_` (`std::endl` or `out_.flush()`) after every response—GUIs read over pipes and block forever on buffered stdout!

## What the tests check

- **`is_fifty_move_draw()`**: FEN with halfmove clock `99` returns `false`, `100` returns `true`; playing 100 quiet non-pawn plies triggers `true`.
- **`is_insufficient_material()`**: `K vs K`, `K+N vs K`, `K+B vs K`, and same-colored `K+B vs K+B` return `true`; `K+P vs K`, `K+R vs K`, `K+Q vs K`, and opposite-colored `K+B vs K+B` return `false`.
- **`is_repetition(3)`**: repeating a position 3 times (`Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8`) returns `true`, while only 2 occurrences returns `false`.
- **`UciEngine` transcript tests**:
  - `uci` emits `id name`, `id author`, and `uciok`.
  - `isready` emits `readyok`.
  - `position startpos moves ...` and `position fen ... moves ...` update `engine.position()` accurately.
  - `ucinewgame` resets cleanly.
  - `go depth 3` emits `info depth ... score ... pv ...` and `bestmove <legal_uci>`.
  - `go depth 3` on a mate-in-1 emits `score mate 1` (positive mate score) and the mating `bestmove`.
  - `go movetime 50` and `go nodes 1000` return a legal `bestmove`.
  - `quit` makes `process_line("quit")` return `false` and ends `loop()`.
- **Self-play sanity**: alternating `go depth 2` and `position startpos moves ...` for 6 plies produces valid legal moves and consistent state throughout.

## Gotchas

- **Forgetting to flush `out_`.** When stdout is redirected to a pipe (by a GUI or test harness), `'\n'` alone is block-buffered, not line-buffered. Always flush `out_` after `uciok`, `readyok`, `info ...`, and `bestmove ...`.
- **Carriage returns (`\r\n`) or trailing spaces in UCI lines.** Trim `\r` and whitespace when splitting tokens with `std::string_view`, or `"uci\r"` won't match `"uci"`.
- **UCI mate score units.** UCI expects `score mate N` in **full moves**, not plies (`(plies_to_mate + 1) / 2` for winning mates, `-(plies_to_mate + 1) / 2` when getting mated). For a mate-in-1 (`MATE_SCORE - 1`), `(1 + 1) / 2 == 1`, so UCI prints `score mate 1`!
- **Clearing `history_` on `Position::from_fen` vs `make_move`.** Make sure `from_fen` seeds the hash history vector with the starting position's hash (`history_ = { hash_ }`), and `make_move` pushes while `unmake_move` pops, so `is_repetition` stays exact across `position ... moves ...`.

## Now read the real ones

- Chess Programming Wiki: [UCI](https://www.chessprogramming.org/UCI), [Repetitions](https://www.chessprogramming.org/Repetitions), [Fifty-move Rule](https://www.chessprogramming.org/Fifty-move_Rule), [Material Draw](https://www.chessprogramming.org/Material#Insufficient_Material)
- Stockfish: [`uci.cpp`](https://github.com/official-stockfish/Stockfish/blob/master/src/uci.cpp)
- cppreference: [`std::istream`](https://en.cppreference.com/w/cpp/io/basic_istream), [`std::ostream::flush`](https://en.cppreference.com/w/cpp/io/basic_ostream/flush), [`std::from_chars`](https://en.cppreference.com/w/cpp/utility/from_chars).
