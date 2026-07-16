package traceui

import (
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/djfrsn/maestro-mini/internal/session"
)

// activeSessionLease is the operational window in which an unfinished
// session file is considered running. Claude JSONL does not expose shared
// process status, so its final native record is the durable activity signal.
const activeSessionLease = 15 * time.Minute

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
	files map[string]fileState
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
		return cache.refreshOperationalState(now), nil
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
		status, endedAt := operationalState(summary, now)
		rows = append(rows, RootSummary{Provider: cache.provider.Name(), SessionID: id, StartedAt: started, EndedAt: endedAt, Status: status, Model: summary.Model, Usage: usage, NodeCount: nodeCount, SourcePath: path, Confidence: summary.Confidence})
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
	cache.snap = snapshot{rows: rows, asOf: now, store: store, files: nextFiles}
	cache.mu.Unlock()
	return true, nil
}

// refreshOperationalState advances time-dependent lifecycle state while
// reusing every cached summary. It reports a change when a fresh active file
// crosses the lease boundary so the poller emits an SSE invalidation.
func (cache *cache) refreshOperationalState(now time.Time) bool {
	cache.mu.Lock()
	defer cache.mu.Unlock()

	rows := cache.snap.rows
	changed := false
	for i, row := range cache.snap.rows {
		state, ok := cache.snap.files[row.SourcePath]
		if !ok {
			continue
		}
		status, endedAt := operationalState(state.summary, now)
		if row.Status == status && equalTimes(row.EndedAt, endedAt) {
			continue
		}
		if !changed {
			rows = append([]RootSummary(nil), cache.snap.rows...)
			changed = true
		}
		rows[i].Status = status
		rows[i].EndedAt = endedAt
	}
	cache.snap.rows = rows
	cache.snap.asOf = now
	return changed
}

// operationalState closes an unfinished session after its final native record
// has aged past one lease. Claude can rewrite an old file, so filesystem mtime
// is not a reliable sign that the session is still alive.
func operationalState(summary session.FileSummary, asOf time.Time) (session.Status, *time.Time) {
	if summary.Status != session.StatusActive || summary.EndedAt != nil {
		return summary.Status, utcTime(summary.EndedAt)
	}
	if summary.LastActivityAt == nil {
		return summary.Status, nil
	}
	lastActivity := summary.LastActivityAt.UTC()
	if asOf.Sub(lastActivity) <= activeSessionLease {
		return session.StatusActive, nil
	}
	return session.StatusAborted, &lastActivity
}

func equalTimes(left, right *time.Time) bool {
	if left == nil || right == nil {
		return left == right
	}
	return left.Equal(*right)
}

func utcTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	result := value.UTC()
	return &result
}

// projectOperationalRecord applies the snapshot's operational lifecycle to a
// record parsed for tree or detail display, keeping every HTTP surface aligned
// with the root list.
func (snap snapshot) projectOperationalRecord(record *session.Record) {
	if record.Status == session.StatusMalformed || record.Status == session.StatusMissing {
		return
	}
	state, ok := snap.files[record.SourcePath]
	if !ok {
		return
	}
	record.Status, record.EndedAt = operationalState(state.summary, snap.asOf)
}

func (snap snapshot) projectOperationalTree(tree session.Tree) {
	tree.Walk(func(node *session.Node) {
		if node.Status == session.StatusMalformed || node.Status == session.StatusMissing {
			return
		}
		state, ok := snap.files[node.SourcePath]
		if !ok {
			return
		}
		node.Status, node.EndedAt = operationalState(state.summary, snap.asOf)
	})
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
