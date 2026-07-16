package traceui

import (
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/djfrsn/maestro-mini/internal/session"
)

type RootSummary struct {
	Provider   string             `json:"provider"`
	SessionID  string             `json:"session_id"`
	StartedAt  *time.Time         `json:"started_at"`
	EndedAt    *time.Time         `json:"ended_at"`
	Status     session.Status     `json:"status"`
	Model      string             `json:"model"`
	Usage      *session.Usage     `json:"usage"`
	NodeCount  int                `json:"node_count"`
	SourcePath string             `json:"source_path"`
	Confidence session.Confidence `json:"confidence"`
}

type fileState struct {
	mtime   int64
	size    int64
	summary session.FileSummary
}

type snapshot struct {
	rows  []RootSummary
	asOf  time.Time
	store *session.Store
}

type cache struct {
	provider session.Provider
	root     string
	files    map[string]fileState
	mu       sync.RWMutex
	snap     snapshot
}

func newCache(provider session.Provider, root string) *cache {
	return &cache{provider: provider, root: root, files: map[string]fileState{}, snap: snapshot{rows: []RootSummary{}}}
}

func (cache *cache) current() snapshot {
	cache.mu.RLock()
	defer cache.mu.RUnlock()
	return cache.snap
}

func (cache *cache) refresh(now time.Time) (bool, error) {
	paths, err := cache.provider.ListSessionFiles(cache.root)
	if err != nil {
		return false, err
	}
	type signature struct{ mtime, size int64 }
	stats := make(map[string]signature, len(paths))
	for _, path := range paths {
		info, statErr := os.Stat(path)
		if statErr == nil {
			stats[path] = signature{info.ModTime().UnixNano(), info.Size()}
		}
	}
	changed := len(stats) != len(cache.files)
	if !changed {
		for path, stat := range stats {
			prior, ok := cache.files[path]
			if !ok || prior.mtime != stat.mtime || prior.size != stat.size {
				changed = true
				break
			}
		}
	}
	if !changed {
		cache.mu.Lock()
		cache.snap.asOf = now
		cache.mu.Unlock()
		return false, nil
	}
	store, err := session.ScanStore(cache.provider, cache.root)
	if err != nil {
		return false, err
	}
	nextFiles := make(map[string]fileState, len(stats))
	for path, stat := range stats {
		if prior, ok := cache.files[path]; ok && prior.mtime == stat.mtime && prior.size == stat.size {
			nextFiles[path] = prior
			continue
		}
		summary, scanErr := cache.provider.Summarize(path)
		if scanErr != nil && summary.Confidence == "" {
			summary = session.FileSummary{Meta: session.Meta{SessionID: identityFromPath(path)}, Status: session.StatusMalformed, Confidence: session.ConfidenceNone, Errors: []string{scanErr.Error()}}
		}
		nextFiles[path] = fileState{mtime: stat.mtime, size: stat.size, summary: summary}
	}
	rows := make([]RootSummary, 0, len(store.RootPaths())+len(store.Malformed()))
	rootSet := map[string]bool{}
	for _, path := range store.RootPaths() {
		rootSet[path] = true
	}
	for _, path := range store.Malformed() {
		if filepath.Base(filepath.Dir(path)) != "subagents" {
			rootSet[path] = true
		}
	}
	for path := range rootSet {
		state := nextFiles[path]
		summary := state.summary
		id := first(summary.Meta.SessionID, identityFromPath(path))
		var started *time.Time
		if !summary.Meta.StartedAt.IsZero() {
			value := summary.Meta.StartedAt
			started = &value
		}
		usage := summary.Usage
		nodeCount := store.DescendantCount(id) + 1
		if record, resolveErr := store.Resolve(id); resolveErr == nil || record.Status == session.StatusMalformed {
			if tree, treeErr := store.BuildTree(record); treeErr == nil {
				usage = aggregateUsage(tree)
				nodeCount = 0
				tree.Walk(func(*session.Node) { nodeCount++ })
			}
		}
		rows = append(rows, RootSummary{Provider: cache.provider.Name(), SessionID: id, StartedAt: started, EndedAt: summary.EndedAt, Status: summary.Status, Model: summary.Model, Usage: usage, NodeCount: nodeCount, SourcePath: path, Confidence: summary.Confidence})
	}
	sort.Slice(rows, func(i, j int) bool {
		left, right := rowStart(rows[i]), rowStart(rows[j])
		if !left.Equal(right) {
			return left.After(right)
		}
		return rows[i].SessionID > rows[j].SessionID
	})
	cache.files = nextFiles
	cache.mu.Lock()
	cache.snap = snapshot{rows: rows, asOf: now, store: store}
	cache.mu.Unlock()
	return true, nil
}

func aggregateUsage(tree session.Tree) *session.Usage {
	var total session.Usage
	found := false
	tree.Walk(func(node *session.Node) {
		if node.Usage == nil {
			return
		}
		found = true
		total.InputTokens += node.Usage.InputTokens
		total.CachedInputTokens += node.Usage.CachedInputTokens
		total.OutputTokens += node.Usage.OutputTokens
		total.ReasoningOutputTokens += node.Usage.ReasoningOutputTokens
		total.TotalTokens += node.Usage.TotalTokens
	})
	if !found {
		return nil
	}
	return &total
}

func identityFromPath(path string) string {
	name := filepath.Base(path)
	name = filepath.Base(name[:len(name)-len(filepath.Ext(name))])
	if len(name) > 6 && name[:6] == "agent-" {
		return name[6:]
	}
	return name
}

func first(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func rowStart(row RootSummary) time.Time {
	if row.StartedAt == nil {
		return time.Time{}
	}
	return *row.StartedAt
}
