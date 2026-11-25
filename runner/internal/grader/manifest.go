package grader

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Prebuilt layout (written by `cppatlas-grader prebuild`, read-only at run time):
//
//	/opt/cppatlas/challenges/<name>/prebuilt/
//	  manifest.json                     this file (Manifest)
//	  ccache/                           ccache warmed with the support TUs and
//	                                    the starter header (CCACHE_READONLY at run time)
//	  build/<compiler>-<preset>/        configured Ninja build dirs whose support
//	                                    objects/libraries are already built
//
// The build dirs were configured for the source tree at WorkDir (e.g.
// /work/vector) with build dir WorkDir/build/<compiler>-<preset>; at run time
// the source tree and the one matching build dir are copied to exactly those
// paths (mtimes preserved), so ninja finds everything up to date except what
// depends on the learner's files.
type Manifest struct {
	Challenge     string             `json:"challenge"`
	WorkDir       string             `json:"work_dir"`
	GraderVersion string             `json:"grader_version"`
	Ccache        string             `json:"ccache,omitempty"` // relative to prebuilt/, "" = none
	Variants      map[string]Variant `json:"variants"`
}

// Variant is one compiler x preset build dir.
type Variant struct {
	Compiler   string   `json:"compiler"`  // gcc | clang
	Preset     string   `json:"preset"`    // debug | asan-ubsan
	CXX        string   `json:"cxx"`       // absolute compiler path
	Version    string   `json:"version"`   // "g++ 16.2.0"
	BuildDir   string   `json:"build_dir"` // relative to WorkDir, e.g. build/gcc-debug
	Stages     []string `json:"stages"`    // from cppatlas-stages.txt ("01", ...)
	TestEnv    []string `json:"test_env"`  // from cppatlas-test-env.txt (ASAN_OPTIONS=...)
	PrebuildMs int64    `json:"prebuild_ms"`
}

// VariantKey is "<compiler>-<preset>".
func VariantKey(compiler, preset string) string { return compiler + "-" + preset }

// PrebuiltDir is /opt/cppatlas/challenges/<name>/prebuilt.
func (c Config) PrebuiltDir(name string) string {
	return filepath.Join(c.ChallengeDir(name), "prebuilt")
}

// LoadManifest reads prebuilt/manifest.json.
func LoadManifest(cfg Config, challenge string) (*Manifest, error) {
	b, err := os.ReadFile(filepath.Join(cfg.PrebuiltDir(challenge), "manifest.json"))
	if err != nil {
		return nil, err
	}
	var m Manifest
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, fmt.Errorf("manifest: %w", err)
	}
	want := filepath.Join(cfg.WorkRoot, challenge)
	if m.WorkDir != want {
		return nil, fmt.Errorf("manifest: prebuilt for %s but the work dir is %s", m.WorkDir, want)
	}
	return &m, nil
}
