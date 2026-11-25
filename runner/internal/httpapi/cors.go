package httpapi

import (
	"net/http"
	"net/url"
	"strings"
)

// DefaultAllowedOrigins are the production browser origins.
var DefaultAllowedOrigins = []string{"https://cppatlas.com", "https://www.cppatlas.com"}

// originPolicy decides whether a browser Origin may use the API. Matching is
// exact on scheme + host + port after parsing; no substring or suffix tests.
type originPolicy struct {
	exact     map[string]struct{}
	localhost bool
}

// canonicalOrigin parses an Origin value ("https://cppatlas.com") into
// "scheme://host:port" or reports false. Anything that is not a bare origin
// (path, query, userinfo, "null") is rejected.
func canonicalOrigin(s string) (scheme, host, port string, ok bool) {
	u, err := url.Parse(s)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" ||
		u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.Opaque != "" {
		return "", "", "", false
	}
	host = strings.ToLower(u.Hostname())
	port = u.Port()
	if port == "" {
		port = map[string]string{"http": "80", "https": "443"}[u.Scheme]
	}
	if host == "" {
		return "", "", "", false
	}
	return u.Scheme, host, port, true
}

func newOriginPolicy(allowed []string, localhost bool) *originPolicy {
	if len(allowed) == 0 {
		allowed = DefaultAllowedOrigins
	}
	p := &originPolicy{exact: map[string]struct{}{}, localhost: localhost}
	for _, o := range allowed {
		if sc, h, pt, ok := canonicalOrigin(strings.TrimRight(strings.TrimSpace(o), "/")); ok {
			p.exact[sc+"://"+h+":"+pt] = struct{}{}
		}
	}
	return p
}

func (p *originPolicy) allowed(origin string) bool {
	sc, h, pt, ok := canonicalOrigin(origin)
	if !ok {
		return false
	}
	if _, hit := p.exact[sc+"://"+h+":"+pt]; hit {
		return true
	}
	return p.localhost && sc == "http" && (h == "localhost" || h == "127.0.0.1")
}

func setCORS(w http.Header, origin string) {
	w.Set("Access-Control-Allow-Origin", origin) // echoed, never "*"
	w.Set("Access-Control-Expose-Headers", "Retry-After, Location")
	// No Access-Control-Allow-Credentials: the API is cookie-less.
}
