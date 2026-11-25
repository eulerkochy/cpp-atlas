package httpapi

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// Trusted proxy modes.
const TrustedProxyFly = "fly"

// clientIP returns the address of the caller.
//
// Forwarding headers are attacker-controlled unless a proxy we trust sets
// them, so the default is the TCP peer address (RemoteAddr). On Fly every
// public request passes through Fly's proxy, which sets Fly-Client-IP to the
// real peer (overwriting anything the client sent). Only with
// TrustedProxy == "fly" do we believe that header. X-Forwarded-For is never
// used: its leftmost entries are whatever the client wrote.
//
// Trusting Fly-Client-IP assumes every request on this listener came through
// Fly's edge proxy. Fly's proxy reaches the app over IPv4, while other
// machines in the org (including run machines executing untrusted code) can
// connect directly over the IPv6 private network (6PN) and set the header
// themselves. In production the public listener therefore binds IPv4 only
// (LISTEN_ADDR=0.0.0.0:8080), so 6PN peers cannot reach it; cmd/api warns at
// start-up when TRUSTED_PROXY=fly is combined with any other listen address.
func clientIP(r *http.Request, trusted string) netip.Addr {
	if trusted == TrustedProxyFly {
		if v := strings.TrimSpace(r.Header.Get("Fly-Client-IP")); v != "" {
			if ip, err := netip.ParseAddr(v); err == nil {
				return ip.Unmap()
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if i := strings.IndexByte(host, '%'); i >= 0 { // zone
		host = host[:i]
	}
	if ip, err := netip.ParseAddr(host); err == nil {
		return ip.Unmap()
	}
	return netip.IPv4Unspecified()
}
