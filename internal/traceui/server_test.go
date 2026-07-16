package traceui

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/djfrsn/maestro-mini/internal/session"
)

func fixtureRoot() string { return filepath.Join("..", "session", "testdata", "claude-basic") }

func edgeFixtureRoot() string { return filepath.Join("..", "session", "testdata", "claude-edge") }

func TestHTTPContract(t *testing.T) {
	server, err := New(Options{Provider: session.Claude, Root: fixtureRoot()})
	if err != nil {
		t.Fatal(err)
	}
	httpServer := httptest.NewServer(server)
	defer httpServer.Close()

	page := getBody(t, httpServer.URL+"/")
	if !strings.Contains(page, "<title>TraceUI</title>") || !strings.Contains(page, `<article class="session">`) {
		t.Fatal("initial document does not contain title and session row")
	}

	var list listResponse
	decodeBody(t, httpServer.URL+"/api/v1/sessions", &list)
	if len(list.Sessions) != 1 {
		t.Fatalf("sessions = %d, want 1", len(list.Sessions))
	}
	root := list.Sessions[0]
	if root.Provider != "claude" || root.NodeCount != 3 {
		t.Fatalf("root summary = %#v", root)
	}
	if root.Usage == nil || root.Usage.TotalTokens != 618 {
		t.Fatalf("aggregate usage = %#v, want 618", root.Usage)
	}

	var tree treeResponse
	decodeBody(t, httpServer.URL+"/api/v1/sessions/"+root.SessionID+"/tree", &tree)
	if len(tree.Document.Nodes) != 3 || tree.Document.Schema != session.SchemaSessionTreeV1 {
		t.Fatalf("tree = %#v", tree.Document)
	}

	var detail detailResponse
	decodeBody(t, httpServer.URL+"/api/v1/sessions/"+root.SessionID+"/detail", &detail)
	if len(detail.Detail.Transcript) == 0 {
		t.Fatal("detail transcript is empty")
	}
}

func TestHTTPEdgeContract(t *testing.T) {
	root := t.TempDir()
	copyTree(t, edgeFixtureRoot(), root)
	server, err := New(Options{Provider: session.Claude, Root: root})
	if err != nil {
		t.Fatal(err)
	}
	httpServer := httptest.NewServer(server)
	defer httpServer.Close()

	var list listResponse
	decodeBody(t, httpServer.URL+"/api/v1/sessions", &list)
	rows := map[string]RootSummary{}
	for _, row := range list.Sessions {
		rows[row.SessionID] = row
	}
	if len(rows) != 17 {
		t.Fatalf("roots = %d, want 17 edge roots: %#v", len(rows), rows)
	}
	if row := rows["aaaaaaaa-aaaa-4aaa-8aaa-00000000000a"]; row.Status != session.StatusMalformed || row.Confidence != session.ConfidenceNone {
		t.Fatalf("malformed root summary = %#v", row)
	}
	if row := rows["88888888-8888-4888-8888-000000000008"]; row.Status != session.StatusActive || row.EndedAt != nil {
		t.Fatalf("pending root summary = %#v", row)
	}
	if row := rows["cccccccc-cccc-4ccc-8ccc-00000000000c"]; row.Status != session.StatusCompleted || row.EndedAt == nil {
		t.Fatalf("slash-command root summary = %#v", row)
	}
	for _, id := range []string{"44444444-4444-4444-8444-000000000004", "99999999-9999-4999-8999-000000000009"} {
		if rows[id].NodeCount != 2 {
			t.Errorf("%s node count = %d, want root plus represented child", id, rows[id].NodeCount)
		}
	}

	var missingTree treeResponse
	decodeBody(t, httpServer.URL+"/api/v1/sessions/99999999-9999-4999-8999-000000000009/tree", &missingTree)
	if len(missingTree.Document.Nodes) != 2 || missingTree.Document.Nodes[1].Status != session.StatusMissing || missingTree.Document.Nodes[1].SourcePath != "" {
		t.Fatalf("missing-child tree = %#v", missingTree.Document)
	}

	var malformedTree treeResponse
	decodeBody(t, httpServer.URL+"/api/v1/sessions/aaaaaaaa-aaaa-4aaa-8aaa-00000000000a/tree", &malformedTree)
	if len(malformedTree.Document.Nodes) != 1 || malformedTree.Document.Nodes[0].Status != session.StatusMalformed {
		t.Fatalf("malformed-root tree = %#v", malformedTree.Document)
	}
	var malformedDetail detailResponse
	decodeBody(t, httpServer.URL+"/api/v1/sessions/aaaaaaaa-aaaa-4aaa-8aaa-00000000000a/detail", &malformedDetail)
	diagnostic, err := json.Marshal(malformedDetail.Detail.Detail)
	if err != nil {
		t.Fatal(err)
	}
	if malformedDetail.Detail.Status != session.StatusMalformed || strings.Contains(string(diagnostic), "MALFORMED-ROOT-BODY-SECRET") {
		t.Fatalf("malformed detail = %s", diagnostic)
	}

	var privacyTree treeResponse
	decodeBody(t, httpServer.URL+"/api/v1/sessions/55555555-5555-4555-8555-000000000005/tree", &privacyTree)
	treeJSON, err := json.Marshal(privacyTree)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(treeJSON), "PRIVACY-") {
		t.Fatalf("tree metadata disclosed a message body: %s", treeJSON)
	}
	var privacyDetail detailResponse
	decodeBody(t, httpServer.URL+"/api/v1/sessions/55555555-5555-4555-8555-000000000005/detail", &privacyDetail)
	metadataJSON, err := json.Marshal(privacyDetail.Detail.Detail)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(metadataJSON), "PRIVACY-") {
		t.Fatalf("detail metadata disclosed a message body: %s", metadataJSON)
	}
	transcriptJSON, err := json.Marshal(privacyDetail.Detail.Transcript)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(transcriptJSON), "PRIVACY-USER-BODY-SECRET") {
		t.Fatal("detail transcript does not contain its explicit local message body")
	}
}

type countingProvider struct {
	session.Provider
	summaries int
	fileReads int
}

func (provider *countingProvider) ScanMeta(path string) (session.Meta, error) {
	provider.fileReads++
	return provider.Provider.ScanMeta(path)
}

func (provider *countingProvider) ParseFile(path string) (session.Record, error) {
	provider.fileReads++
	return provider.Provider.ParseFile(path)
}

func (provider *countingProvider) Summarize(path string) (session.FileSummary, error) {
	provider.summaries++
	provider.fileReads++
	return provider.Provider.Summarize(path)
}

func TestHTTPStaleUnfinishedSessionIsOperationallyAborted(t *testing.T) {
	const sessionID = "77777777-7777-4777-8777-000000000077"
	root := t.TempDir()
	path := writeUnfinishedSession(t, root, sessionID)
	lastWrite := time.Now().Add(-activeSessionLease - time.Minute).Truncate(time.Second)
	if err := os.Chtimes(path, lastWrite, lastWrite); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	wantEndedAt := info.ModTime().UTC()

	server, err := New(Options{Provider: session.Claude, Root: root})
	if err != nil {
		t.Fatal(err)
	}
	httpServer := httptest.NewServer(server)
	defer httpServer.Close()

	var list listResponse
	decodeBody(t, httpServer.URL+"/api/v1/sessions", &list)
	if len(list.Sessions) != 1 {
		t.Fatalf("sessions = %d, want 1", len(list.Sessions))
	}
	assertOperationallyAborted(t, "list", list.Sessions[0].Status, list.Sessions[0].EndedAt, wantEndedAt)

	var tree treeResponse
	decodeBody(t, httpServer.URL+"/api/v1/sessions/"+sessionID+"/tree", &tree)
	if len(tree.Document.Nodes) != 1 {
		t.Fatalf("tree nodes = %d, want 1", len(tree.Document.Nodes))
	}
	assertOperationallyAborted(t, "tree", tree.Document.Nodes[0].Status, tree.Document.Nodes[0].EndedAt, wantEndedAt)

	var detail detailResponse
	decodeBody(t, httpServer.URL+"/api/v1/sessions/"+sessionID+"/detail", &detail)
	assertOperationallyAborted(t, "detail", detail.Detail.Status, detail.Detail.EndedAt, wantEndedAt)
}

func TestCacheFreshUnfinishedSessionExpiresWithoutJSONLRescan(t *testing.T) {
	const sessionID = "77777777-7777-4777-8777-000000000077"
	root := t.TempDir()
	path := writeUnfinishedSession(t, root, sessionID)
	lastWrite := time.Now().Truncate(time.Second)
	if err := os.Chtimes(path, lastWrite, lastWrite); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	wantEndedAt := info.ModTime().UTC()

	provider := &countingProvider{Provider: session.Claude}
	cache := newCache(provider, root)
	changed, err := cache.refresh(wantEndedAt.Add(time.Minute))
	if err != nil || !changed {
		t.Fatalf("initial refresh: changed=%v err=%v", changed, err)
	}
	row := cache.current().rows[0]
	if row.Status != session.StatusActive || row.EndedAt != nil {
		t.Fatalf("fresh unfinished row = status %q ended_at %v, want active with no end", row.Status, row.EndedAt)
	}
	baselineReads := provider.fileReads

	changed, err = cache.refresh(wantEndedAt.Add(activeSessionLease + time.Second))
	if err != nil || !changed {
		t.Fatalf("expiry refresh: changed=%v err=%v, want changed snapshot for SSE", changed, err)
	}
	if provider.fileReads != baselineReads {
		t.Fatalf("expiry refresh performed %d JSONL reads, want 0", provider.fileReads-baselineReads)
	}
	row = cache.current().rows[0]
	assertOperationallyAborted(t, "cache", row.Status, row.EndedAt, wantEndedAt)
}

func TestCacheSkipsUnchangedFilesAndReconcilesRemoval(t *testing.T) {
	root := t.TempDir()
	copyTree(t, fixtureRoot(), root)
	provider := &countingProvider{Provider: session.Claude}
	cache := newCache(provider, root)
	changed, err := cache.refresh(time.Now())
	if err != nil || !changed {
		t.Fatalf("first refresh: changed=%v err=%v", changed, err)
	}
	firstScans := provider.summaries
	changed, err = cache.refresh(time.Now().Add(time.Second))
	if err != nil || changed {
		t.Fatalf("unchanged refresh: changed=%v err=%v", changed, err)
	}
	if provider.summaries != firstScans {
		t.Fatalf("unchanged refresh rescanned %d files", provider.summaries-firstScans)
	}
	rootPath := cache.current().rows[0].SourcePath
	if err := os.Remove(rootPath); err != nil {
		t.Fatal(err)
	}
	changed, err = cache.refresh(time.Now().Add(2 * time.Second))
	if err != nil || !changed {
		t.Fatalf("removal refresh: changed=%v err=%v", changed, err)
	}
	if len(cache.current().rows) != 0 {
		t.Fatalf("rows after root removal = %d, want 0", len(cache.current().rows))
	}
}

func TestCacheMalformedSourceDoesNotBlockHealthyRefresh(t *testing.T) {
	root := t.TempDir()
	copyTree(t, edgeFixtureRoot(), root)
	cache := newCache(session.Claude, root)
	changed, err := cache.refresh(time.Now())
	if err != nil || !changed {
		t.Fatalf("initial refresh: changed=%v err=%v", changed, err)
	}
	assertStatuses := func(wantPending session.Status) {
		t.Helper()
		rows := map[string]RootSummary{}
		for _, row := range cache.current().rows {
			rows[row.SessionID] = row
		}
		if rows["aaaaaaaa-aaaa-4aaa-8aaa-00000000000a"].Status != session.StatusMalformed {
			t.Fatalf("malformed root disappeared: %#v", rows)
		}
		if rows["88888888-8888-4888-8888-000000000008"].Status != wantPending {
			t.Fatalf("pending root status = %s, want %s", rows["88888888-8888-4888-8888-000000000008"].Status, wantPending)
		}
	}
	assertStatuses(session.StatusActive)

	pendingPath := filepath.Join(root, "-fixture-workspace", "88888888-8888-4888-8888-000000000008.jsonl")
	file, err := os.OpenFile(pendingPath, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	_, writeErr := io.WriteString(file, `{"type":"assistant","cwd":"/fixture/workspace","sessionId":"88888888-8888-4888-8888-000000000008","version":"2.1.205","timestamp":"2026-07-12T14:06:00Z","message":{"role":"assistant","model":"claude-fable-5","content":[{"type":"text","text":"answer"}],"stop_reason":"end_turn","usage":{"input_tokens":5,"output_tokens":2}}}`+"\n")
	closeErr := file.Close()
	if writeErr != nil || closeErr != nil {
		t.Fatalf("append pending response: write=%v close=%v", writeErr, closeErr)
	}
	changed, err = cache.refresh(time.Now().Add(time.Second))
	if err != nil || !changed {
		t.Fatalf("refresh after healthy append: changed=%v err=%v", changed, err)
	}
	assertStatuses(session.StatusCompleted)
}

func TestSSEEmitsChangedAfterAppend(t *testing.T) {
	root := t.TempDir()
	copyTree(t, fixtureRoot(), root)
	server, err := New(Options{Provider: session.Claude, Root: root, PollInterval: 10 * time.Millisecond, KeepAliveInterval: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	httpServer := httptest.NewServer(server)
	defer httpServer.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go server.poll(ctx)
	client := &http.Client{Timeout: 3 * time.Second}
	response, err := client.Get(httpServer.URL + "/api/v1/events")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	rootPath := server.cache.current().rows[0].SourcePath
	file, err := os.OpenFile(rootPath, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	_, err = io.WriteString(file, "{\"type\":\"system\",\"timestamp\":\"2026-07-12T09:06:00Z\",\"sessionId\":\"11111111-1111-4111-8111-000000000001\"}\n")
	_ = file.Close()
	if err != nil {
		t.Fatal(err)
	}
	scanner := bufio.NewScanner(response.Body)
	for scanner.Scan() {
		if scanner.Text() == "event: changed" {
			return
		}
	}
	t.Fatalf("changed event not received: %v", scanner.Err())
}

// TestListTotalsArePageIndependent proves the dataset-wide totals reported by
// the list endpoint are identical on every page and equal the aggregate over the
// fully paginated session set. Before totals were carried in the response, a
// caller reading the first page of /api/v1/sessions saw only page-sized counts
// while the UI paginated to completion, so the two surfaces disagreed. The
// existing single-session fixture never crossed defaultPageLimit, so pagination
// and this invariant went untested.
func TestListTotalsArePageIndependent(t *testing.T) {
	const rowCount = defaultPageLimit + 50
	const activeCount = 3
	rows := syntheticRows(rowCount, activeCount)
	wantTokens := int64(0)
	for _, row := range rows {
		wantTokens += row.Usage.TotalTokens
	}

	server, err := New(Options{Provider: session.Claude, Root: fixtureRoot()})
	if err != nil {
		t.Fatal(err)
	}
	server.cache.mu.Lock()
	server.cache.snap.rows = rows
	server.cache.mu.Unlock()

	httpServer := httptest.NewServer(server)
	defer httpServer.Close()

	wantTotals := Totals{Sessions: rowCount, Active: activeCount, TotalTokens: wantTokens}
	cursor := ""
	pages := 0
	collected := 0
	pagedTokens := int64(0)
	for {
		url := httpServer.URL + "/api/v1/sessions"
		if cursor != "" {
			url += "?cursor=" + cursor
		}
		var page listResponse
		decodeBody(t, url, &page)
		pages++
		if page.Totals != wantTotals {
			t.Fatalf("page %d totals = %#v, want %#v", pages, page.Totals, wantTotals)
		}
		if pages == 1 && len(page.Sessions) != defaultPageLimit {
			t.Fatalf("first page returned %d sessions, want %d", len(page.Sessions), defaultPageLimit)
		}
		collected += len(page.Sessions)
		for _, row := range page.Sessions {
			if row.Usage != nil {
				pagedTokens += row.Usage.TotalTokens
			}
		}
		if page.NextCursor == nil {
			break
		}
		cursor = *page.NextCursor
	}
	if pages < 2 {
		t.Fatalf("expected pagination across multiple pages, got %d", pages)
	}
	if collected != rowCount {
		t.Fatalf("paginated session count = %d, want %d", collected, rowCount)
	}
	if pagedTokens != wantTotals.TotalTokens {
		t.Fatalf("paginated token sum = %d, want %d (must equal reported totals)", pagedTokens, wantTotals.TotalTokens)
	}
}

// syntheticRows builds rowCount summaries pre-sorted the way the cache emits
// them (descending start, then descending id) so the cursor walk observes the
// same order the handler assumes. The first activeCount rows are marked active
// and each row carries a distinct token count.
func syntheticRows(rowCount, activeCount int) []RootSummary {
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	rows := make([]RootSummary, 0, rowCount)
	for i := 0; i < rowCount; i++ {
		started := base.Add(time.Duration(i) * time.Minute)
		status := session.StatusCompleted
		if i < activeCount {
			status = session.StatusActive
		}
		rows = append(rows, RootSummary{
			Provider:  "claude",
			SessionID: fmt.Sprintf("sess-%05d", i),
			StartedAt: &started,
			Status:    status,
			Model:     "claude-opus-4-8",
			Usage:     &session.Usage{TotalTokens: int64(i + 1)},
			NodeCount: 1,
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		left, right := rowStart(rows[i]), rowStart(rows[j])
		if !left.Equal(right) {
			return left.After(right)
		}
		return rows[i].SessionID > rows[j].SessionID
	})
	return rows
}

func decodeBody(t *testing.T, url string, target any) {
	t.Helper()
	response, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("GET %s = %s", url, response.Status)
	}
	if err := json.NewDecoder(response.Body).Decode(target); err != nil {
		t.Fatal(err)
	}
}

func getBody(t *testing.T, url string) string {
	t.Helper()
	response, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	bytes, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(bytes)
}

func writeUnfinishedSession(t *testing.T, root, sessionID string) string {
	t.Helper()
	directory := filepath.Join(root, "-fixture-workspace")
	if err := os.MkdirAll(directory, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(directory, sessionID+".jsonl")
	contents := `{"type":"user","timestamp":"2026-07-12T09:00:00Z","sessionId":"` + sessionID + `","cwd":"/fixture/workspace","version":"0.0.0-fixture","message":{"role":"user","content":"[fixture prompt]"}}` + "\n"
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func assertOperationallyAborted(t *testing.T, surface string, status session.Status, endedAt *time.Time, wantEndedAt time.Time) {
	t.Helper()
	if status != session.StatusAborted {
		t.Fatalf("%s status = %q, want %q", surface, status, session.StatusAborted)
	}
	if endedAt == nil || !endedAt.Equal(wantEndedAt) {
		t.Fatalf("%s ended_at = %v, want last write %v", surface, endedAt, wantEndedAt)
	}
}

func copyTree(t *testing.T, source, target string) {
	t.Helper()
	err := filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		destination := filepath.Join(target, relative)
		if entry.IsDir() {
			return os.MkdirAll(destination, 0o755)
		}
		contents, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(destination, contents, 0o644)
	})
	if err != nil {
		t.Fatal(err)
	}
}
