## Your task

Implement fancy magic bitboards and BMI2 `PEXT` indexing in `include/chess/magic.hpp`, and wire `rook_attacks`, `bishop_attacks`, and `queen_attacks` in `include/chess/bitboard.hpp` to `rook_attacks_magic`, `bishop_attacks_magic`, and `queen_attacks_magic`.

The exact frozen Stage 3 API in `include/chess/magic.hpp`:

```cpp
namespace chess {

[[nodiscard]] constexpr Bitboard rook_relevancy_mask(Square sq) noexcept;
[[nodiscard]] constexpr Bitboard bishop_relevancy_mask(Square sq) noexcept;

template <class Fn>
constexpr void for_each_subset(Bitboard mask, Fn&& fn);

struct MagicEntry {
    Bitboard mask = 0;
    std::uint64_t magic = 0;
    std::uint32_t offset = 0;
    std::uint8_t shift = 64;

    [[nodiscard]] constexpr std::size_t index(Bitboard occ) const noexcept;
};

[[nodiscard]] constexpr bool has_hardware_pext() noexcept;
[[nodiscard]] inline Bitboard pext_index(Bitboard occ, Bitboard mask) noexcept;

[[nodiscard]] inline bool verify_magic(Square sq, bool is_bishop, std::uint64_t magic,
                                       std::size_t* constructive_collisions = nullptr);

[[nodiscard]] inline std::uint64_t find_magic_number(Square sq, bool is_bishop,
                                                     std::uint64_t seed = 0x9E3779B97F4A7C15ULL);

[[nodiscard]] inline const MagicEntry& rook_magic_entry(Square sq) noexcept;
[[nodiscard]] inline const MagicEntry& bishop_magic_entry(Square sq) noexcept;

[[nodiscard]] inline Bitboard rook_attacks_magic(Square sq, Bitboard occ) noexcept;
[[nodiscard]] inline Bitboard bishop_attacks_magic(Square sq, Bitboard occ) noexcept;
[[nodiscard]] inline Bitboard queen_attacks_magic(Square sq, Bitboard occ) noexcept;

} // namespace chess
```

Keep `rook_attacks_slow`, `bishop_attacks_slow`, and `queen_attacks_slow` untouched in `bitboard.hpp` so Stage 3 tests and `./cppatlas bench` can verify magic attacks against the naive rays bit-for-bit and benchmark the speedup. Test locally with `./cppatlas test 3`, run `./cppatlas bench`, or submit with `./cppatlas submit`.

## Design & C++23 mechanics

Why spend an entire stage on sliding-piece lookups? Because sliding attack generation sits at the heart of Perft, legal movegen, pin detection, and static exchange evaluation—and compressing it from **~20 ns** down to **<1 ns** traces a classic systems optimization arc:

1. **Naive unary-fold ray sliding (~20 ns).** Stage 2's `rook_attacks_slow` and `bishop_attacks_slow` walk up to 7 steps along each of 4 rays per call. Every ray has a data-dependent loop trip count and an unpredictable `if (cur & occ) break;` branch, costing ~20 ns per lookup.
2. **Brute-force lookup is impossible (9.44 ZB).** Indexing a precomputed table directly by `(sq, occ)` means `64` squares × `2^64` occupancies × `8` bytes = `9.44 × 10^21` bytes (**9.44 zettabytes**) — larger than all storage on Earth.
3. **Relevancy masks + Carry-Rippler + hash map (~6 ns).**
   - **Relevancy masks (`rook_relevancy_mask`, `bishop_relevancy_mask`)**: along any ray, the outermost edge square never blocks anything *past* it—whether occupied or empty, the ray terminates there and that edge square is still attacked. Stripping outer edge bits (`~(RANK_1 | RANK_8)` along files and `~(FILE_A | FILE_H)` along ranks for rooks; `~(FILE_A | FILE_H | RANK_1 | RANK_8)` for bishops) reduces relevant blocker squares to **10–12 bits for rooks** (12 on corners, 11 on edges, 10 in the interior) and **5–9 bits for bishops** (9 on `d4/d5/e4/e5`). Summing `2^popcount(mask)` across all 64 squares gives **102,400 rook entries** (`800 KiB`) and **5,248 bishop entries** (`41 KiB`) — **107,648 entries (~841 KiB)** total, comfortably inside L2/L3 cache.
   - **Carry-Rippler (`for_each_subset`)**: enumerate every subset of `mask` in 3 lines with zero recursion or bit-unpacking loops:
     ```cpp
     Bitboard subset = 0;
     do {
         fn(subset);
         subset = (subset - mask) & mask;
     } while (subset != 0);
     ```
     Subtracting `mask` flips the lowest set bit of `mask` that isn't yet set in `subset` and borrows across the masked-out zeros—visiting all `2^popcount(mask)` subsets in ascending order.
   - Even with relevancy masks, looking up `occ & mask` in an `std::unordered_map` costs ~6 ns due to hashing, bucket pointer chasing, and cache misses.
4. **Hardware `PEXT` vs Portable Fancy Magic Bitboards (<1 ns).**
   - **Hardware `PEXT` (`pext_index`)**: x86-64 BMI2 (`__BMI2__`) offers `_pext_u64(occ, mask)`, which extracts the `k` bits selected by `mask` into the lowest `k` bits `[0, 2^k - 1]` in one instruction on modern Intel and AMD Zen 3+ CPUs. However, `PEXT` is **non-portable**: it executes via ~18-cycle microcode on older AMD Zen 1/Zen 2 chips and **does not exist on ARM64** (Apple Silicon, AWS Graviton), requiring a portable loop fallback in `pext_index` when `!has_hardware_pext()`.
   - **Portable Fancy Magic Bitboards (`MagicEntry::index`)**:
     ```cpp
     return offset + static_cast<std::size_t>(((occ & mask) * magic) >> shift);
     ```
     where `shift = 64 - popcount(mask)`. Four register instructions (`and`, `imul`, `shr`, load) run in **<1 ns** uniformly on x86-64 *and* ARM64. Storing all 64 squares' subtables contiguously in one flat array indexed by `MagicEntry::offset` ("fancy" magic bitboards) cuts memory to the exact **102,400 + 5,248 = 107,648** entries instead of a fixed `64 × 4096` stride.

### Why sparse random magics work and what constructive collisions are

How can a single 64-bit integer multiplication act like a perfect hash for scattered board bits?

- **Why sparse magics?** Unsigned 64-bit multiplication `x * magic` equals the sum of shifted copies of `x`—one copy per set bit in `magic`. We want the `k` scattered bits of `occ & mask` to land in the top `k` bits `[63 .. 64 - k]` without carrying into one another. A dense random 64-bit number (~32 set bits) piles 32 shifted copies on top of each other and carries destroy bit uniqueness. Generating **sparse** candidates by ANDing three SplitMix64 draws (`r1 & r2 & r3`, averaging ~8 set bits) and checking `popcount((mask * magic) & 0xFF00000000000000ULL) >= 6` yields valid magics in milliseconds.
- **Constructive collisions.** Two distinct blocker subsets `s1 != s2` often produce the **exact same** attack bitboard (for example, if `d5` is occupied, whether `d6` and `d7` are occupied or empty cannot change the rook's North ray). When `s1` and `s2` hash to the same index *and* have identical attack bitboards, that collision is **constructive**—it harms nothing and lets `verify_magic` accept denser tables! Only a **destructive collision** (same index, different attack bitboard) rejects a candidate magic.

### `consteval` limits, build-time codegen, and Amdahl's Law

- **Why build-time generation (`tools/magic_gen.cpp`) instead of `consteval`?** Searching all 128 squares tests tens of thousands of sparse PRNG draws and calls `verify_magic` over up to 4,096 subsets per candidate—hundreds of millions of constexpr steps, blowing past compiler `-fconstexpr-steps` / `-fconstexpr-ops-limit` budgets and hurting incremental builds. Real engines run `tools/magic_gen.cpp` once to emit the verified 64-entry `MagicEntry` tables as `constexpr` arrays, while keeping `verify_magic` and `find_magic_number` runtime-testable in Stage 3.
- **Amdahl's Law (`./cppatlas bench`).** Running `bench/sliding_bench.cpp` via `./cppatlas bench` shows a **~20× microbenchmark speedup** (~20 ns → <1 ns) on isolated `rook_attacks` / `bishop_attacks` calls. Yet end-to-end **Perft** speeds up much less (governed by Amdahl's Law, $S = 1 / ((1 - p) + p / s)$), because sliding lookups are only fraction $p$ of total Perft time alongside `make_move`/`unmake_move` and move list generation.

Explore the entire pipeline visually on the **Magic & PEXT** tab of `/build/chess`: pick Rook or Bishop on any square to see its relevancy mask, masked occupancy (`occ & mask`), `PEXT` bit extraction vs sparse magic product/shift, and constructive collisions on the board.

## What the tests check

- `rook_relevancy_mask` and `bishop_relevancy_mask`: excludes outer edge squares (`popcount` 10–12 for rooks, 5–9 for bishops), never includes `sq` itself, sums to `102,400` rook entries and `5,248` bishop entries across all 64 squares, and returns `0` for `SQ_NONE`.
- `for_each_subset`: visits `2^popcount(mask)` distinct subsets including `0` and `mask` itself (even for `mask == 0`, visiting `0` once).
- `pext_index`: packs masked bits in LSB-to-MSB order into `[0, 2^popcount(mask) - 1]` identically whether `has_hardware_pext()` is `true` or `false`.
- `verify_magic` and `find_magic_number`: rejects `0` and naive colliding magics, accepts valid sparse magics, reports `constructive_collisions > 0` for squares with occluded blockers, and finds working magics for corners, edges, and center squares.
- `rook_magic_entry`, `bishop_magic_entry`, `rook_attacks_magic`, `bishop_attacks_magic`, `queen_attacks_magic` (and `bitboard.hpp`'s `rook_attacks`, `bishop_attacks`, `queen_attacks`): match `*_slow` bit-for-bit across all 64 squares and thousands of random/edge-case occupancies, returning `0` on `SQ_NONE`.

## Gotchas

- **Forgetting edge exclusions in relevancy masks.** Including `A1`/`H1`/`A8`/`H8` in `rook_relevancy_mask` inflates corner masks from 12 bits (`4096` entries) to 14 bits (`16384` entries)—breaking the `102,400` total table size and exhausting `find_magic_number`. Remember: for a rook on `a1`, only `b1..g1` and `a2..a7` are relevant (`a1`, `h1`, and `a8` are excluded!).
- **64-bit shift UB when `mask == 0` (`shift == 64`).** In `MagicEntry::index`, shifting a `uint64_t` by `64` is undefined behavior in C++ (`-fsanitize=undefined` catches it immediately!). Guard `shift >= 64` (or use `shift = 64 - popcount(mask)` only when `mask != 0`, and return `offset` when `mask == 0`).
- **Using `std::unordered_map` or slow checks inside `find_magic_number`.** Testing thousands of candidates with dynamic heap allocations per candidate takes seconds per square. Reuse a fixed-size `std::array<Bitboard, 4096>` (and a `uint32_t epoch` array instead of `std::fill`!) inside `verify_magic` / `find_magic_number` so finding all 128 magics takes milliseconds even under Debug + ASan.
- **Not resetting the `used` table between destructive collisions.** If `verify_magic` sees a destructive collision on candidate `m`, using an incrementing `epoch` stamp avoids zeroing 4,096 entries on every failed candidate.

## Now read the real ones

- Chess Programming Wiki: [Magic Bitboards](https://www.chessprogramming.org/Magic_Bitboards), [Looking for Magics](https://www.chessprogramming.org/Looking_for_Magics), [Traversing Subsets of a Set](https://www.chessprogramming.org/Traversing_Subsets_of_a_Set) (Carry-Rippler), [BMI2](https://www.chessprogramming.org/BMI2#PEXT)
- Stockfish: [`magic` initialization in `bitboard.cpp`](https://github.com/official-stockfish/Stockfish/blob/master/src/bitboard.cpp) (uses `PEXT` when `USE_PEXT` is enabled and fancy magic bitboards otherwise)
- cppreference: [`<bit>`](https://en.cppreference.com/w/cpp/header/bit), [`std::popcount`](https://en.cppreference.com/w/cpp/numeric/popcount), [`consteval`](https://en.cppreference.com/w/cpp/language/consteval).
