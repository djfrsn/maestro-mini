package session

import (
	"fmt"
	"sort"
	"time"
)

type StoreEntry struct {
	SessionID, ParentSessionID, AgentNickname, AgentRole string
	StartedAt                                            time.Time
	Path                                                 string
}
type Store struct {
	provider  Provider
	root      string
	paths     []string
	byID      map[string]StoreEntry
	byPath    map[string]StoreEntry
	children  map[string][]StoreEntry
	malformed []string
}

func ScanStore(provider Provider, root string) (*Store, error) {
	paths, err := provider.ListSessionFiles(root)
	if err != nil {
		return nil, err
	}
	store := &Store{provider: provider, root: root, paths: paths, byID: map[string]StoreEntry{}, byPath: map[string]StoreEntry{}, children: map[string][]StoreEntry{}}
	for _, path := range paths {
		meta, scanErr := provider.ScanMeta(path)
		if scanErr != nil {
			store.malformed = append(store.malformed, path)
			continue
		}
		entry := StoreEntry{meta.SessionID, meta.ParentSessionID, meta.AgentNickname, meta.AgentRole, meta.StartedAt, path}
		store.byPath[path] = entry
		if _, exists := store.byID[entry.SessionID]; exists {
			continue
		}
		store.byID[entry.SessionID] = entry
		if entry.ParentSessionID != "" {
			store.children[entry.ParentSessionID] = append(store.children[entry.ParentSessionID], entry)
		}
	}
	for parent := range store.children {
		siblings := store.children[parent]
		sort.SliceStable(siblings, func(i, j int) bool {
			if !siblings[i].StartedAt.Equal(siblings[j].StartedAt) {
				return siblings[i].StartedAt.Before(siblings[j].StartedAt)
			}
			return siblings[i].SessionID < siblings[j].SessionID
		})
	}
	return store, nil
}
func (store *Store) RootPaths() []string {
	var roots []string
	for _, path := range store.paths {
		if entry, ok := store.byPath[path]; ok && entry.ParentSessionID == "" {
			roots = append(roots, path)
		}
	}
	return roots
}
func (store *Store) Malformed() []string               { return store.malformed }
func (store *Store) ChildrenOf(id string) []StoreEntry { return store.children[id] }
func (store *Store) Resolve(id string) (Record, error) {
	if entry, ok := store.byID[id]; ok {
		return store.provider.ParseFile(entry.Path)
	}
	for _, path := range store.paths {
		if store.provider.MatchesSessionID(path, id) {
			return store.provider.ParseFile(path)
		}
	}
	return Record{}, fmt.Errorf("session: id %s under %s: %w", id, store.root, ErrSessionNotFound)
}
func (store *Store) DescendantCount(id string) int {
	seen := map[string]bool{id: true}
	stack := []string{id}
	count := 0
	for len(stack) > 0 {
		at := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		for _, child := range store.children[at] {
			if seen[child.SessionID] {
				continue
			}
			seen[child.SessionID] = true
			count++
			stack = append(stack, child.SessionID)
		}
	}
	return count
}
