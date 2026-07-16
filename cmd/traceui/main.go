package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/djfrsn/maestro-mini/internal/session"
	"github.com/djfrsn/maestro-mini/internal/traceui"
)

func main() {
	if err := run(os.Args[1:], os.Getenv, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "traceui:", err)
		os.Exit(1)
	}
}

func run(arguments []string, getenv func(string) string, output *os.File) error {
	flags := flag.NewFlagSet("traceui", flag.ContinueOnError)
	flags.SetOutput(output)
	rootFlag := flags.String("root", "", "Claude projects directory")
	addr := flags.String("addr", traceui.DefaultAddr, "loopback listen address")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	root, err := resolveRoot(*rootFlag, getenv)
	if err != nil {
		return err
	}
	if err := validateLoopback(*addr); err != nil {
		return err
	}
	info, err := os.Stat(root)
	if err != nil {
		return fmt.Errorf("open Claude projects root %s: %w", root, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("Claude projects root %s is not a directory", root)
	}
	server, err := traceui.New(traceui.Options{Provider: session.Claude, Root: root, Addr: *addr})
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return server.Run(ctx, func(actual string) {
		fmt.Fprintf(output, "TraceUI: http://%s\nClaude sessions: %s\n", actual, root)
	})
}

func resolveRoot(flagValue string, getenv func(string) string) (string, error) {
	if flagValue != "" {
		return filepath.Clean(flagValue), nil
	}
	if config := getenv("CLAUDE_CONFIG_DIR"); config != "" {
		return filepath.Join(config, "projects"), nil
	}
	if home := getenv("HOME"); home != "" {
		return filepath.Join(home, ".claude", "projects"), nil
	}
	return "", errors.New("cannot locate Claude projects: pass --root or set CLAUDE_CONFIG_DIR or HOME")
}

func validateLoopback(address string) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("invalid --addr %q: %w", address, err)
	}
	if host == "localhost" {
		return nil
	}
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() {
		return fmt.Errorf("--addr must use a loopback host, got %q", host)
	}
	return nil
}
