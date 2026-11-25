//go:build !linux

package sandbox

import "errors"

// Manager is only implemented on Linux; the grader runs only there. This
// stub lets the pure parts of the grader build and be unit-tested elsewhere.
type Manager struct{}

var errUnsupported = errors.New("sandbox: only supported on Linux")

func New(Options) (*Manager, error)    { return nil, errUnsupported }
func (m *Manager) Info() Info          { return Info{} }
func (m *Manager) Run(Cmd) Status      { return Status{StartErr: errUnsupported} }
func (m *Manager) KillAll() error      { return nil }
func HardenSelf() error                { return errUnsupported }
func PrewarmThreads(int)               {}
func NetworkInterfaces() []string      { return nil }
func SetOOMScoreAdj(int) error         { return errUnsupported }
func EnsureTmpfs(string, string) error { return errUnsupported }
func CPUQuota() float64                { return 0 }
func FreeBytes(string) (int64, bool)   { return 0, false }
func RunHelperIfRequested([]string)    {}
func SignalName(n int) string          { return "signal" }
