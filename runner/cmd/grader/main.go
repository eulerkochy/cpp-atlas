// Command cppatlas-grader compiles and tests a learner's submission inside the
// grading image.
//
//	cppatlas-grader [run]                     grade one job (mode A: stdin/stdout;
//	                                          mode B: CPPATLAS_API_URL + CPPATLAS_TOKEN)
//	cppatlas-grader prebuild --challenge N    image build time, as root
//	cppatlas-grader version
//
// The binary also re-executes itself as the sandbox helpers (__sandbox-init,
// __sandbox-exec, __sandbox-probe); those are internal.
package main

import (
	"flag"
	"fmt"
	"os"

	"cppatlas.com/runner/internal/grader"
	"cppatlas.com/runner/internal/grader/sandbox"
)

var version = "dev"

func main() {
	// Must come first: helpers never return and must not run grader code.
	sandbox.RunHelperIfRequested(os.Args)

	cmd := "run"
	args := os.Args[1:]
	if len(args) > 0 {
		cmd, args = args[0], args[1:]
	}
	switch cmd {
	case "run":
		os.Exit(grader.Main(version))
	case "prebuild":
		fs := flag.NewFlagSet("prebuild", flag.ExitOnError)
		ch := fs.String("challenge", "", "challenge name")
		fs.Parse(args)
		logf := func(f string, a ...any) { fmt.Fprintf(os.Stderr, "cppatlas-grader: "+f+"\n", a...) }
		cfg := grader.LoadConfig(os.Getenv, version)
		if err := grader.Prebuild(cfg, *ch, os.Getenv, logf); err != nil {
			logf("prebuild failed: %v", err)
			os.Exit(1)
		}
	case "version", "--version", "-v":
		fmt.Println(version)
	default:
		fmt.Fprintf(os.Stderr, "usage: cppatlas-grader [run | prebuild --challenge NAME | version]\n")
		os.Exit(2)
	}
}
