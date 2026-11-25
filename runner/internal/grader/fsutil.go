package grader

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// CopyTree copies src into dst (created), preserving modes and mtimes (ninja
// relies on them) and recreating symlinks verbatim. skip(rel) excludes paths.
func CopyTree(src, dst string, skip func(rel string, d fs.DirEntry) bool) error {
	return filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, p)
		if err != nil {
			return err
		}
		if rel != "." && skip != nil && skip(filepath.ToSlash(rel), d) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		target := filepath.Join(dst, rel)
		info, err := d.Info()
		if err != nil {
			return err
		}
		switch {
		case d.IsDir():
			if err := os.MkdirAll(target, info.Mode().Perm()|0o700); err != nil {
				return err
			}
		case d.Type()&fs.ModeSymlink != 0:
			link, err := os.Readlink(p)
			if err != nil {
				return err
			}
			if err := os.Symlink(link, target); err != nil {
				return err
			}
			return nil
		case d.Type().IsRegular():
			if err := copyFile(p, target, info.Mode().Perm()); err != nil {
				return err
			}
		default:
			return nil // devices, fifos, sockets: never copied
		}
		return os.Chtimes(target, info.ModTime(), info.ModTime())
	})
}

// FixDirTimes re-applies directory mtimes after a copy (writing children
// changed them). Ninja does not look at directory mtimes, so this is cosmetic
// and only done for the build dir.
func copyFile(src, dst string, perm os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscall.O_NOFOLLOW, perm|0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// WriteNewFile writes content to root/rel, refusing to follow symlinks at any
// level and refusing to leave root. Missing directories are created.
func WriteNewFile(root, rel string, content []byte) error {
	if !validRelPath(rel) {
		return fmt.Errorf("invalid path")
	}
	parts := strings.Split(rel, "/")
	dir := root
	for _, c := range parts[:len(parts)-1] {
		dir = filepath.Join(dir, c)
		fi, err := os.Lstat(dir)
		switch {
		case err == nil && fi.Mode()&fs.ModeSymlink != 0:
			return fmt.Errorf("refusing to write through a symlink")
		case err == nil && !fi.IsDir():
			return fmt.Errorf("path component is not a directory")
		case errors.Is(err, fs.ErrNotExist):
			if err := os.Mkdir(dir, 0o755); err != nil {
				return err
			}
		case err != nil:
			return err
		}
	}
	target := filepath.Join(root, rel)
	if fi, err := os.Lstat(target); err == nil {
		if !fi.Mode().IsRegular() {
			return fmt.Errorf("refusing to replace a non-regular file")
		}
		if err := os.Remove(target); err != nil {
			return err
		}
	}
	f, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscall.O_NOFOLLOW, 0o644)
	if err != nil {
		return err
	}
	if _, err := f.Write(content); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

// ReadUntrusted reads at most limit bytes of a file written by sandboxed code:
// no symlink following, regular files only (never a FIFO or device), opened
// non-blocking. It returns the bytes and whether the file was larger.
func ReadUntrusted(path string, limit int64) ([]byte, bool, error) {
	f, err := OpenUntrusted(path)
	if err != nil {
		return nil, false, err
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil {
		return nil, false, err
	}
	if int64(len(b)) > limit {
		return b[:limit], true, nil
	}
	return b, false, nil
}

// OpenUntrusted opens a sandbox-written regular file safely (see ReadUntrusted).
func OpenUntrusted(path string) (*os.File, error) {
	fd, err := syscall.Open(path, syscall.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK|syscall.O_CLOEXEC, 0)
	if err != nil {
		return nil, err
	}
	f := os.NewFile(uintptr(fd), path)
	fi, err := f.Stat()
	if err != nil || !fi.Mode().IsRegular() {
		f.Close()
		return nil, fmt.Errorf("not a regular file")
	}
	return f, nil
}

// ChownTree changes ownership of every entry under root without following
// symlinks.
func ChownTree(root string, uid, gid int) error {
	return filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		return os.Lchown(p, uid, gid)
	})
}

// EmptyDir removes everything inside dir (not following symlinks) and keeps
// dir itself with its owner and mode. Errors are ignored: it is best-effort
// space reclamation between sandboxed steps.
func EmptyDir(dir string) {
	ents, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range ents {
		os.RemoveAll(filepath.Join(dir, e.Name()))
	}
}
