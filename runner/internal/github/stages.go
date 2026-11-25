package github

import (
	"net/url"
	"strconv"
	"strings"
)

type stageInfo struct {
	Slug  string
	Title string
}

// challengeStages is the per-challenge stage table used for Check Run text and
// spec links. A challenge or stage missing here falls back to "stage N" and
// the challenge's landing page, so a new challenge works before it is listed.
var challengeStages = map[string][]stageInfo{
	"vector": {
		{"empty-vector", "Empty vector"},
		{"push-back", "push_back and storage"},
		{"growth", "Reserve and geometric growth"},
		{"copy-and-move", "Copy and move"},
		{"emplace-back", "emplace_back, pop_back, clear"},
		{"exception-safety", "Strong exception safety"},
		{"iterators", "Iterators and member types"},
		{"insert-erase", "insert and erase"},
	},
}

// stageMeta returns the slug/title for stage n (1-based) of challenge, with a
// generic fallback. known is false for the fallback.
func stageMeta(challenge string, n int) (info stageInfo, known bool) {
	if list, ok := challengeStages[challenge]; ok && n >= 1 && n <= len(list) {
		return list[n-1], true
	}
	return stageInfo{Slug: "stage " + strconv.Itoa(n), Title: "Stage " + strconv.Itoa(n)}, false
}

// challengeURL is the landing page of a challenge.
func challengeURL(site, challenge string) string {
	return strings.TrimRight(site, "/") + "/build/" + url.PathEscape(challenge)
}

// stageURL is the spec page of stage n, or the challenge page when the stage
// has no known slug.
func stageURL(site, challenge string, n int) string {
	info, known := stageMeta(challenge, n)
	if !known {
		return challengeURL(site, challenge)
	}
	return challengeURL(site, challenge) + "/" + url.PathEscape(info.Slug)
}
