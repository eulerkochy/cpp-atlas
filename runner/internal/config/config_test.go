package config

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestDefaults(t *testing.T) {
	c, err := LoadFrom(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if c.ListenAddr != ":8080" || c.InternalListenAddr != ":8081" || c.Backend != "docker" ||
		c.MaxConcurrentRuns != 4 || c.QueueSize != 20 || c.RunTimeout != 120*time.Second ||
		c.ResultTTL != 15*time.Minute || !c.AllowLocalhostOrigins || c.GitHubEnabled() ||
		c.FlyVMCPUs != 4 || c.FlyVMMemoryMB != 4096 || c.RunsPerMinute != 6 || c.RunsBurst != 3 ||
		c.InternalAPIURL != "http://cppatlas-runner.internal:8081" || len(c.AllowedOrigins) != 2 {
		t.Fatalf("unexpected defaults: %v", c)
	}
}

func TestPortAndListenAddr(t *testing.T) {
	c, _ := LoadFrom(env(map[string]string{"PORT": "9000"}))
	if c.ListenAddr != ":9000" {
		t.Fatal(c.ListenAddr)
	}
	c, _ = LoadFrom(env(map[string]string{"PORT": "9000", "LISTEN_ADDR": "127.0.0.1:1"}))
	if c.ListenAddr != "127.0.0.1:1" {
		t.Fatal(c.ListenAddr)
	}
}

func TestFlyBackendRequirements(t *testing.T) {
	_, err := LoadFrom(env(map[string]string{"BACKEND": "fly"}))
	if err == nil || !strings.Contains(err.Error(), "FLY_API_TOKEN") || !strings.Contains(err.Error(), "GRADER_REGION") {
		t.Fatalf("err=%v", err)
	}
	c, err := LoadFrom(env(map[string]string{"BACKEND": "fly", "FLY_API_TOKEN": "tok", "GRADER_REGION": "iad"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.AllowLocalhostOrigins {
		t.Fatal("localhost origins should default off on fly")
	}
	c, _ = LoadFrom(env(map[string]string{"BACKEND": "fly", "FLY_API_TOKEN": "t", "GRADER_REGION": "iad", "ALLOW_LOCALHOST_ORIGINS": "true"}))
	if !c.AllowLocalhostOrigins {
		t.Fatal("explicit override ignored")
	}
}

func TestGitHubAllOrNothing(t *testing.T) {
	if _, err := LoadFrom(env(map[string]string{"GITHUB_APP_ID": "1"})); err == nil {
		t.Fatal("partial github config accepted")
	}
	c, err := LoadFrom(env(map[string]string{"GITHUB_APP_ID": "1", "GITHUB_APP_PRIVATE_KEY": `a\nb`, "GITHUB_WEBHOOK_SECRET": "s"}))
	if err != nil || !c.GitHubEnabled() || c.GitHubAppPrivateKey.Reveal() != "a\nb" {
		t.Fatalf("%v %v", c, err)
	}
}

func TestSecretsRedacted(t *testing.T) {
	c, _ := LoadFrom(env(map[string]string{"BACKEND": "fly", "GRADER_REGION": "iad", "FLY_API_TOKEN": "supersecret",
		"GITHUB_APP_ID": "1", "GITHUB_APP_PRIVATE_KEY": "pemsecret", "GITHUB_WEBHOOK_SECRET": "whsecret"}))
	for _, s := range []string{c.String(), fmt.Sprintf("%v", c), fmt.Sprintf("%+v", c), fmt.Sprintf("%#v", c.FlyAPIToken)} {
		for _, bad := range []string{"supersecret", "pemsecret", "whsecret"} {
			if strings.Contains(s, bad) {
				t.Fatalf("leaked %q in %s", bad, s)
			}
		}
	}
	if c.FlyAPIToken.Reveal() != "supersecret" {
		t.Fatal("reveal")
	}
}

func TestValidationErrors(t *testing.T) {
	bad := map[string]string{
		"BACKEND": "k8s", "TRUSTED_PROXY": "cf", "QUEUE_SIZE": "0", "MAX_CONCURRENT_RUNS": "x",
		"RUN_TIMEOUT": "-1s", "RATE_RUNS_PER_MIN": "0", "ALLOWED_ORIGINS": "https://*.x.com", "LOG_LEVEL": "loud",
		"DEFAULT_COMPILER": "msvc", "FLY_API_BASE_URL": "ftp://x", "INTERNAL_LISTEN_ADDR": "nope",
	}
	for k, v := range bad {
		if _, err := LoadFrom(env(map[string]string{k: v})); err == nil {
			t.Errorf("%s=%s accepted", k, v)
		}
	}
}

func TestAllowedOriginsList(t *testing.T) {
	c, err := LoadFrom(env(map[string]string{"ALLOWED_ORIGINS": " https://a.com , http://b.com:3000 ,"}))
	if err != nil || len(c.AllowedOrigins) != 2 || c.AllowedOrigins[1] != "http://b.com:3000" {
		t.Fatalf("%v %v", c.AllowedOrigins, err)
	}
}

func TestHardeningSettings(t *testing.T) {
	c, err := LoadFrom(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if c.MaxRunsPerClient != 2 || c.MaxStoredRuns != 500 || c.MaxStoredBytes != 64<<20 || c.MaxResultBytes != 512<<10 ||
		c.QueueMaxWeb != 15 || c.QueueMaxGitHub != 10 || c.GlobalRunsPer10 != 120 || c.GlobalRunsBurst != 40 ||
		c.LongPollPerClient != 4 || c.LongPollTotal != 64 || !c.FlyBindPeer {
		t.Fatalf("defaults: %v", c)
	}
	c, err = LoadFrom(env(map[string]string{
		"MAX_RUNS_PER_CLIENT": "0", "MAX_STORED_RUNS": "50", "MAX_STORED_BYTES": "2097152", "MAX_RESULT_BYTES": "65536",
		"QUEUE_SIZE": "8", "GLOBAL_RUNS_PER_10MIN": "0", "GLOBAL_RUNS_BURST": "5",
		"LONGPOLL_MAX_PER_CLIENT": "2", "LONGPOLL_MAX_TOTAL": "10", "FLY_BIND_PEER": "false",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.MaxRunsPerClient != 0 || c.MaxStoredRuns != 50 || c.MaxStoredBytes != 2<<20 || c.MaxResultBytes != 64<<10 ||
		c.QueueMaxWeb != 6 || c.QueueMaxGitHub != 4 || c.GlobalRunsPer10 != 0 || c.GlobalRunsBurst != 5 ||
		c.LongPollPerClient != 2 || c.LongPollTotal != 10 || c.FlyBindPeer {
		t.Fatalf("overrides: %v", c)
	}
	for _, bad := range []map[string]string{
		{"QUEUE_MAX_WEB": "21"},
		{"QUEUE_MAX_GITHUB": "0"},
		{"MAX_RESULT_BYTES": "4194304"},
		{"MAX_STORED_BYTES": "1000"},
		{"GLOBAL_RUNS_PER_10MIN": "-1"},
		{"LONGPOLL_MAX_TOTAL": "0"},
		{"FLY_BIND_PEER": "maybe"},
	} {
		if _, err := LoadFrom(env(bad)); err == nil {
			t.Errorf("accepted %v", bad)
		}
	}
}

func TestIPv4OnlyListen(t *testing.T) {
	for addr, want := range map[string]bool{
		"0.0.0.0:8080": true, "127.0.0.1:1": true, ":8080": false, "[::]:8080": false,
		"[::ffff:0.0.0.0]:8080": false, "fly-local-6pn:8081": false, "[fdaa::1]:80": false,
	} {
		if got := IPv4OnlyListen(addr); got != want {
			t.Errorf("%s: %v", addr, got)
		}
	}
}
