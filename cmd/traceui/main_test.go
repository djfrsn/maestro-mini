package main

import (
	"path/filepath"
	"testing"
)

func TestResolveRootPrecedence(t *testing.T) {
	env := func(key string) string {
		if key == "CLAUDE_CONFIG_DIR" {
			return "/config"
		}
		if key == "HOME" {
			return "/home/user"
		}
		return ""
	}
	if got, _ := resolveRoot("/explicit", env); got != filepath.Clean("/explicit") {
		t.Fatalf("explicit root = %q", got)
	}
	if got, _ := resolveRoot("", env); got != filepath.Join("/config", "projects") {
		t.Fatalf("config root = %q", got)
	}
	if got, _ := resolveRoot("", func(key string) string {
		if key == "HOME" {
			return "/home/user"
		}
		return ""
	}); got != filepath.Join("/home/user", ".claude", "projects") {
		t.Fatalf("home root = %q", got)
	}
}

func TestValidateLoopback(t *testing.T) {
	for _, address := range []string{"127.0.0.1:7777", "[::1]:0", "localhost:9000"} {
		if err := validateLoopback(address); err != nil {
			t.Fatalf("validate %s: %v", address, err)
		}
	}
	for _, address := range []string{"0.0.0.0:7777", "192.168.1.4:7777", ":7777"} {
		if err := validateLoopback(address); err == nil {
			t.Fatalf("validate %s unexpectedly succeeded", address)
		}
	}
}
