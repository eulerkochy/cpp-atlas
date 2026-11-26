## Your task

Implement `TranspositionTable` in `include/chess/tt.hpp`, and wire it together with iterative deepening, killer/TT move ordering, `on_info` callbacks, node/time limits, and `request_stop()` in `include/chess/search.hpp`.

In `include/chess/tt.hpp`:

```cpp
namespace chess {

enum class TTBound : std::uint8_t { None = 0, Exact = 1, Lower = 2, Upper = 3 };

struct TTEntry {
    std::uint64_t key = 0;
    Move best_move{};
    std::int16_t score = 0;
    std::uint8_t depth = 0;
    TTBound bound = TTBound::None;
};

class TranspositionTable {
public:
    explicit TranspositionTable(std::size_t megabytes = 16);

    void clear() noexcept;
    void resize_mb(std::size_t mb);
    std::size_t size() const noexcept;

    bool probe(std::uint64_t key, TTEntry& out) const noexcept;
    void store(std::uint64_t key, int depth, int score, TTBound bound, Move best_move,
               int ply) noexcept;
};

} // namespace chess
```

And in `include/chess/search.hpp`, make sure `Searcher` supports:

```cpp
void clear_tt() noexcept;
void resize_tt(std::size_t mb);
void set_use_tt(bool enabled) noexcept;
void request_stop() noexcept;
```

and honors `SearchLimits` (`max_depth`, `max_nodes`, `movetime_ms`) plus `on_info(const SearchInfo&)`.

Verify with `./cppatlas submit` or `./cppatlas test 8`.

## Design & C++23 mechanics

Why does caching search results need **mate-score ply normalization**?

- Suppose White finds a mate-in-3 from a position reached at `ply = 4`. Its score at that node is `MATE_SCORE - 7` (mate at total ply `4 + 3 = 7`), meaning "3 plies from *here*".
- Later, a transposition reaches the **exact same board** at `ply = 2`. If the TT returned `MATE_SCORE - 7` unmodified, the engine would think it takes `7 - 2 = 5` plies from there instead of `3`—corrupting mate distances and cutoff bounds!
- **The fix in `tt.hpp`:**
  - In `store(..., score, ..., ply)`: convert root-relative mate score to *node-relative* distance before storing:
    ```cpp
    if (score > MATE_THRESHOLD) score += ply;
    else if (score < -MATE_THRESHOLD) score -= ply;
    ```
  - `probe(key, out)` returns the stored `TTEntry` verbatim (leaving `out.score` node-relative, which unit tests verify directly).
  - Inside `Searcher`, right after `probe`, convert back to root-relative by subtracting `ply` for positive mates and adding `ply` for negative mates!

Other key mechanics in Stage 8:

- **Power-of-two table sizing (`std::bit_floor`)**: sizing `entries_` to a power of two lets `probe` and `store` index with `key & (entries_.size() - 1)` instead of slow 64-bit integer modulo `%`. Guard `resize_mb(0)` safely (e.g. minimum 1 entry or 1 MB).
- **Iterative deepening (`for (int d = 1; d <= limits.max_depth; ++d)`)**: searching depths `1, 2, ..., d` looks redundant, yet is *faster* than jumping straight to depth `d` because each shallow iteration populates the TT with the best move (`tt_move`), giving near-optimal move ordering at the next depth! After each completed depth, extract the PV and invoke `on_info(info)`.
- **Time & node limits + `std::atomic<bool> stop_`**: poll `std::chrono::steady_clock::now()` and `nodes` periodically (e.g. every `1024` or `2048` nodes) plus `stop_.load(std::memory_order_relaxed)`. Always finish `depth = 1` first so `search` never returns an illegal `Move{}` when legal moves exist, and discard partial/aborted deeper iterations instead of overwriting the last completed `best_move`.
- **Respect `use_tt_`**: when `set_use_tt(false)` is set, skip TT probing and storing so tests can directly verify TT node reduction.

## What the tests check

- **`TranspositionTable` unit tests**: empty table misses on `probe`; `store` + `probe` round-trips `key`, `depth`, `bound`, `best_move`, and `score`; `clear()` clears all entries; `resize_mb(1)` / `resize_mb(4)` adjusts `size()` cleanly; mate-score normalization stores `MATE_SCORE - 5` at `ply = 5` identically to `MATE_SCORE - 2` at `ply = 2`.
- **Iterative deepening & `on_info`**: searching `max_depth = 4` invokes `on_info` with depths `1, 2, 3, 4`, non-decreasing `nodes`, and a non-empty legal `pv` whose first move matches `best_move`.
- **TT speedup**: on a transposition-rich middlegame/endgame position at depth 4–5, `set_use_tt(true)` visits strictly fewer nodes than `set_use_tt(false)`.
- **Node and time budgets**: `SearchLimits{.max_depth = 10, .max_nodes = 2000}` stops near the node budget with a legal move; `SearchLimits{.max_depth = 20, .movetime_ms = 100}` returns promptly with a legal move.
- **Mate-in-3**: solves a deeper mate-in-3 tactical puzzle at depth 6.

## Gotchas

- **Using an aborted iteration's `best_move`.** If `stop_` triggers halfway through depth 5 after only checking one bad move, overwriting `best_move` from completed depth 4 with depth 5's partial candidate causes random blunders. Abort out of the recursion cleanly via a `stopped_` flag and keep the result from the last *completed* depth.
- **Forgetting to adjust `TTEntry::score` back by `ply` on `probe`.** `store` adds `ply` for positive mates and subtracts `ply` for negative mates; `Searcher` must invert that adjustment when reading `entry.score` back out.
- **Resetting `stop_` at the start of `search()`.** Always clear `stop_.store(false, std::memory_order_relaxed)` at the beginning of `search` (and re-use `SearchResult` cleanly) so a previous `request_stop()` doesn't freeze all subsequent searches.
- **Returning TT cutoffs at the root or on draw positions.** Don't take an immediate TT return at `ply == 0` without setting `best_move` (or avoid TT cutoffs at root altogether while still using `tt_move` for ordering), and don't let a TT cutoff mask a repetition draw in Stage 9.

## Now read the real ones

- Chess Programming Wiki: [Transposition Table](https://www.chessprogramming.org/Transposition_Table), [Iterative Deepening](https://www.chessprogramming.org/Iterative_Deepening), [Killer Heuristic](https://www.chessprogramming.org/Killer_Heuristic)
- Stockfish: [`tt.h`](https://github.com/official-stockfish/Stockfish/blob/master/src/tt.h) and [`tt.cpp`](https://github.com/official-stockfish/Stockfish/blob/master/src/tt.cpp)
- cppreference: [`std::chrono::steady_clock`](https://en.cppreference.com/w/cpp/chrono/steady_clock), [`std::atomic`](https://en.cppreference.com/w/cpp/atomic/atomic), [`std::bit_floor`](https://en.cppreference.com/w/cpp/numeric/bit_floor).
