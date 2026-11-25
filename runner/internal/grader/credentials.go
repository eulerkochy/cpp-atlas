package grader

import (
	"encoding/json"
	"io"
	"os"
	"strconv"
)

// secretFDEnv names the inherited fd carrying the mode B credentials after
// the scrubbing re-exec (see reexecWithoutCredentials).
const secretFDEnv = "CPPATLAS_SECRET_FD"

type credentials struct {
	URL   string `json:"url"`
	Token string `json:"token"`
}

// takeCredentials returns the mode B API URL and token and makes sure they
// are no longer in this process's environment, including the initial
// environment block in /proc/self/environ: if they came from the environment
// the process re-executes itself (same PID) without them first.
func takeCredentials(logf func(string, ...any)) (apiURL, token string) {
	if v := os.Getenv(secretFDEnv); v != "" {
		os.Unsetenv(secretFDEnv)
		fd, err := strconv.Atoi(v)
		if err != nil || fd < 3 {
			logf("warning: bad %s", secretFDEnv)
			return "", ""
		}
		f := os.NewFile(uintptr(fd), "credentials")
		b, err := io.ReadAll(io.LimitReader(f, 64<<10))
		f.Close()
		var c credentials
		if err != nil || json.Unmarshal(b, &c) != nil {
			logf("warning: could not read the credentials pipe")
			return "", ""
		}
		return c.URL, c.Token
	}
	apiURL, token = os.Getenv("CPPATLAS_API_URL"), os.Getenv("CPPATLAS_TOKEN")
	if apiURL != "" && token != "" {
		err := reexecWithoutCredentials(apiURL, token) // returns only on failure
		logf("warning: could not re-exec without the credentials (%v); they stay in /proc/self/environ", err)
	}
	// Fallback (and for a lone variable): at least Go's copy is cleared, so
	// nothing derived from os.Environ can carry them.
	os.Unsetenv("CPPATLAS_TOKEN")
	os.Unsetenv("CPPATLAS_API_URL")
	return apiURL, token
}
