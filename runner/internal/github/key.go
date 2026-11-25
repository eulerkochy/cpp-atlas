package github

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var pemBlockRE = regexp.MustCompile(`-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END ([A-Z0-9 ]+)-----`)

// ParsePrivateKey parses the App's RSA private key as it arrives from a secret
// store. It accepts PKCS#1 ("RSA PRIVATE KEY") and PKCS#8 ("PRIVATE KEY") PEM,
// with real newlines, CRLF, literal "\n" escapes or newlines flattened to
// spaces, and the same PEM wrapped in base64 (or bare base64 DER). Encrypted
// keys, non-RSA keys and keys shorter than 2048 bits are rejected. Error
// messages never contain key material.
func ParsePrivateKey(s string) (*rsa.PrivateKey, error) {
	return parsePrivateKey(s, 0)
}

func parsePrivateKey(s string, depth int) (*rsa.PrivateKey, error) {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, `"'`)
	if s == "" {
		return nil, errors.New("github: private key is empty")
	}
	s = strings.ReplaceAll(s, `\r\n`, "\n")
	s = strings.ReplaceAll(s, `\n`, "\n")
	if m := pemBlockRE.FindStringSubmatch(s); m != nil {
		typ, endTyp := m[1], m[3]
		if typ != endTyp {
			return nil, errors.New("github: private key PEM BEGIN/END types differ")
		}
		body := m[2]
		if strings.Contains(body, "Proc-Type:") || strings.Contains(body, "DEK-Info:") || typ == "ENCRYPTED PRIVATE KEY" {
			return nil, errors.New("github: private key is encrypted; provide the unencrypted PEM GitHub generated")
		}
		der, err := base64.StdEncoding.DecodeString(stripSpace(body))
		if err != nil {
			return nil, errors.New("github: private key PEM body is not valid base64")
		}
		switch typ {
		case "RSA PRIVATE KEY":
			k, err := x509.ParsePKCS1PrivateKey(der)
			if err != nil {
				return nil, errors.New("github: private key is not a valid PKCS#1 RSA key")
			}
			return checkKey(k)
		case "PRIVATE KEY":
			return parsePKCS8(der)
		default:
			return nil, fmt.Errorf("github: unsupported PEM block type %q (want RSA PRIVATE KEY or PRIVATE KEY)", typ)
		}
	}
	if depth > 0 {
		return nil, errors.New("github: private key is not PEM")
	}
	// Not PEM: maybe base64 of the PEM, or base64 DER.
	raw := stripSpace(s)
	var decoded []byte
	var err error
	for _, enc := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding} {
		if decoded, err = enc.DecodeString(raw); err == nil {
			break
		}
	}
	if err != nil {
		return nil, errors.New("github: private key is neither PEM nor base64")
	}
	if strings.Contains(string(decoded), "-----BEGIN") {
		return parsePrivateKey(string(decoded), depth+1)
	}
	if k, err := x509.ParsePKCS1PrivateKey(decoded); err == nil {
		return checkKey(k)
	}
	return parsePKCS8(decoded)
}

func parsePKCS8(der []byte) (*rsa.PrivateKey, error) {
	k, err := x509.ParsePKCS8PrivateKey(der)
	if err != nil {
		return nil, errors.New("github: private key is not a valid PKCS#1 or PKCS#8 key")
	}
	rk, ok := k.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("github: private key is %T, GitHub Apps use RSA", k)
	}
	return checkKey(rk)
}

func checkKey(k *rsa.PrivateKey) (*rsa.PrivateKey, error) {
	if k.N.BitLen() < 2048 {
		return nil, fmt.Errorf("github: RSA key is %d bits, need at least 2048", k.N.BitLen())
	}
	if err := k.Validate(); err != nil {
		return nil, errors.New("github: RSA key failed validation")
	}
	return k, nil
}

func stripSpace(s string) string {
	return strings.Map(func(r rune) rune {
		switch r {
		case ' ', '\n', '\r', '\t', '\v', '\f':
			return -1
		}
		return r
	}, s)
}

// appJWT builds the RS256 App JWT: iat 60 s in the past (clock drift), exp 9
// minutes ahead (GitHub's maximum is 10), iss = the App ID (a number when the
// ID is numeric, else the client ID string).
func appJWT(key *rsa.PrivateKey, appID string, now time.Time) (string, error) {
	header := `{"alg":"RS256","typ":"JWT"}`
	var iss any = appID
	if n, err := strconv.ParseInt(appID, 10, 64); err == nil {
		iss = n
	}
	claims, err := json.Marshal(struct {
		Iat int64 `json:"iat"`
		Exp int64 `json:"exp"`
		Iss any   `json:"iss"`
	}{now.Add(-60 * time.Second).Unix(), now.Add(9 * time.Minute).Unix(), iss})
	if err != nil {
		return "", err
	}
	enc := base64.RawURLEncoding
	signing := enc.EncodeToString([]byte(header)) + "." + enc.EncodeToString(claims)
	sum := sha256.Sum256([]byte(signing))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		return "", err
	}
	return signing + "." + enc.EncodeToString(sig), nil
}
