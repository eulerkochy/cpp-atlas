//go:build !linux

package grader

import "errors"

func reexecWithoutCredentials(apiURL, token string) error {
	return errors.New("re-exec is only implemented on Linux")
}
