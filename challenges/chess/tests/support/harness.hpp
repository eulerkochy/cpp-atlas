// tests/support/harness.hpp - the single header a stage TU includes.
//
//   #include "support/harness.hpp"
//
// Pulls in: doctest (declarations only; main() lives in doctest_main.cpp, built
// once), alloc_check.hpp (leaked-storage check), preflight.hpp
// (CPPATLAS_PREFLIGHT / CPPATLAS_STAGE_GATE / CPPATLAS_TEST), and <chess/chess.hpp>.
// See README.md in this directory.
#pragma once

#include <chess/chess.hpp>

#include "alloc_check.hpp"
#include "doctest.h"
#include "preflight.hpp"
