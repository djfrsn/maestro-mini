package session

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"
)

func testRoot() string { return filepath.Join("testdata", "claude-basic") }

func edgeRoot() string { return filepath.Join("testdata", "claude-edge") }

func edgePath(id string) string {
	return filepath.Join(edgeRoot(), "-fixture-workspace", id+".jsonl")
}

func TestClaudeStoreBuildsNativeTree(t *testing.T) {
	store, err := ScanStore(Claude, testRoot())
	if err != nil {
		t.Fatal(err)
	}
	roots := store.RootPaths()
	if len(roots) != 1 {
		t.Fatalf("roots = %v", roots)
	}
	record, err := store.Resolve("11111111-1111-4111-8111-000000000001")
	if err != nil {
		t.Fatal(err)
	}
	tree, err := store.BuildTree(record)
	if err != nil {
		t.Fatal(err)
	}
	doc := Export(tree)
	if doc.Schema != "traceui.session-tree/v1" || len(doc.Nodes) != 3 {
		t.Fatalf("document = %#v", doc)
	}
	if doc.Nodes[1].ParentSessionID != record.Meta.SessionID || doc.Nodes[2].Status != StatusActive {
		t.Fatalf("children = %#v", doc.Nodes[1:])
	}
	if record.Usage == nil || record.Usage.TotalTokens != 490 {
		t.Fatalf("root usage = %#v", record.Usage)
	}
}

func TestClaudeMalformedDiagnosticExcludesMessageBody(t *testing.T) {
	path := filepath.Join(t.TempDir(), "broken.jsonl")
	secret := "SECRET-MESSAGE-BODY"
	if err := os.WriteFile(path, []byte("not json "+secret+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	record, err := Claude.ParseFile(path)
	if err == nil || record.Status != StatusMalformed {
		t.Fatalf("record=%#v err=%v", record, err)
	}
	if strings.Contains(err.Error()+strings.Join(record.Errors, " "), secret) {
		t.Fatal("diagnostic disclosed native content")
	}
}

func TestClaudeTranscriptBoundsEntries(t *testing.T) {
	path := filepath.Join(t.TempDir(), "many.jsonl")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 220; i++ {
		_, _ = fmt.Fprintf(file, `{"type":"user","timestamp":"2026-07-12T09:00:00Z","message":{"role":"user","content":"entry %d"}}`+"\n", i)
	}
	_ = file.Close()
	result, err := Claude.Transcript(path)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Truncated || result.OmittedEntries != 20 || len(result.Entries) != 201 {
		t.Fatalf("result = %#v", result)
	}
	if result.Entries[100].Role != "marker" {
		t.Fatalf("marker = %#v", result.Entries[100])
	}
}

func TestClaudeResumedRootUsesFilenameIdentity(t *testing.T) {
	record, err := Claude.ParseFile(edgePath("33333333-3333-4333-8333-000000000003"))
	if err != nil {
		t.Fatal(err)
	}
	if record.Meta.SessionID != "33333333-3333-4333-8333-000000000003" {
		t.Fatalf("session id = %q", record.Meta.SessionID)
	}
	if len(record.AliasSessionIDs) != 1 || record.AliasSessionIDs[0] != "22222222-2222-4222-8222-000000000002" {
		t.Fatalf("aliases = %v", record.AliasSessionIDs)
	}
	if record.Status != StatusCompleted || record.Confidence != ConfidenceFull {
		t.Fatalf("status/confidence = %s/%s", record.Status, record.Confidence)
	}
	if record.Usage == nil || record.Usage.TotalTokens != 48 {
		t.Fatalf("usage = %#v, want copied and resumed usage totaling 48", record.Usage)
	}
}

func TestClaudeStatusFromPendingPromptAndStopReason(t *testing.T) {
	tests := []struct {
		name   string
		id     string
		status Status
		ended  bool
	}{
		{"unanswered prompt stays active", "88888888-8888-4888-8888-000000000008", StatusActive, false},
		{"local slash command completes", "cccccccc-cccc-4ccc-8ccc-00000000000c", StatusCompleted, true},
		{"end turn completes", "dddddddd-dddd-4ddd-8ddd-00000000000d", StatusCompleted, true},
		{"stop sequence completes", "eeeeeeee-eeee-4eee-8eee-00000000000e", StatusCompleted, true},
		{"max tokens completes", "ffffffff-ffff-4fff-8fff-00000000000f", StatusCompleted, true},
		{"refusal completes", "15151515-1515-4515-8515-000000000015", StatusCompleted, true},
		{"context window exceeded completes", "16161616-1616-4616-8616-000000000016", StatusCompleted, true},
		{"tool use stays active", "10101010-1010-4010-8010-000000000010", StatusActive, false},
		{"pause turn stays active", "12121212-1212-4212-8212-000000000012", StatusActive, false},
		{"omitted stop reason stays active", "13131313-1313-4313-8313-000000000013", StatusActive, false},
		{"null stop reason stays active", "14141414-1414-4414-8414-000000000014", StatusActive, false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			record, err := Claude.ParseFile(edgePath(test.id))
			if err != nil {
				t.Fatal(err)
			}
			if record.Status != test.status || (record.EndedAt != nil) != test.ended {
				t.Fatalf("status/ended = %s/%v, want %s/%v", record.Status, record.EndedAt, test.status, test.ended)
			}
		})
	}
}

func TestClaudeMalformedAndDriftRecordsStayVisible(t *testing.T) {
	store, err := ScanStore(Claude, edgeRoot())
	if err != nil {
		t.Fatal(err)
	}
	root, err := store.Resolve("44444444-4444-4444-8444-000000000004")
	if err != nil {
		t.Fatal(err)
	}
	if root.Status != StatusCompleted || root.Confidence != ConfidencePartial {
		t.Fatalf("malformed-parent status/confidence = %s/%s", root.Status, root.Confidence)
	}
	tree, err := store.BuildTree(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(tree.Root.Children) != 1 {
		t.Fatalf("children = %#v", tree.Root.Children)
	}
	child := tree.Root.Children[0]
	if child.Status != StatusMalformed || child.Confidence != ConfidenceNone || child.SourcePath == "" {
		t.Fatalf("malformed child = %#v", child)
	}
	if child.StartedAt == nil || child.StartedAt.Format("2006-01-02T15:04:05Z07:00") != "2026-07-12T10:00:10Z" {
		t.Fatalf("malformed child start = %v, want spawn time", child.StartedAt)
	}

	drift, err := store.Resolve("66666666-6666-4666-8666-000000000006")
	if err != nil {
		t.Fatal(err)
	}
	if drift.Status != StatusCompleted || drift.Confidence != ConfidencePartial {
		t.Fatalf("drift status/confidence = %s/%s", drift.Status, drift.Confidence)
	}
	kinds := map[string]bool{}
	for _, event := range drift.Events {
		kinds[event.Kind] = true
	}
	for _, kind := range []string{"native:workflow-checkpoint", "native:mode", "native:assistant"} {
		if !kinds[kind] {
			t.Errorf("drift events lack %q: %v", kind, kinds)
		}
	}
}

func TestClaudeMissingSpawnedChildHasPlaceholder(t *testing.T) {
	store, err := ScanStore(Claude, edgeRoot())
	if err != nil {
		t.Fatal(err)
	}
	root, err := store.Resolve("99999999-9999-4999-8999-000000000009")
	if err != nil {
		t.Fatal(err)
	}
	tree, err := store.BuildTree(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(tree.Root.Children) != 1 {
		t.Fatalf("children = %#v", tree.Root.Children)
	}
	child := tree.Root.Children[0]
	if child.SessionID != "f0f0f0f0f0f0f0f00" || child.Status != StatusMissing || child.Confidence != ConfidenceNone {
		t.Fatalf("missing child = %#v", child)
	}
	if child.AgentPath != "root/explorer" || child.SourcePath != "" || child.StartedAt == nil {
		t.Fatalf("missing child metadata = %#v", child)
	}
}

func TestClaudeMessageBodiesStayOutOfMetadataAndErrors(t *testing.T) {
	store, err := ScanStore(Claude, edgeRoot())
	if err != nil {
		t.Fatal(err)
	}
	record, err := store.Resolve("55555555-5555-4555-8555-000000000005")
	if err != nil {
		t.Fatal(err)
	}
	tree, err := store.BuildTree(record)
	if err != nil {
		t.Fatal(err)
	}
	summary, err := Claude.Summarize(record.SourcePath)
	if err != nil {
		t.Fatal(err)
	}
	surfaces := []any{record.Meta, record.Errors, summary, DetailFromRecord(record), Export(tree)}
	secrets := []string{
		"PRIVACY-USER-BODY-SECRET",
		"PRIVACY-THINKING-BODY-SECRET",
		"PRIVACY-TOOL-INPUT-SECRET",
		"PRIVACY-TOOL-OUTPUT-SECRET",
		"PRIVACY-ASSISTANT-BODY-SECRET",
	}
	for _, surface := range surfaces {
		encoded, marshalErr := json.Marshal(surface)
		if marshalErr != nil {
			t.Fatal(marshalErr)
		}
		for _, secret := range secrets {
			if strings.Contains(string(encoded), secret) {
				t.Errorf("metadata surface %T disclosed %q", surface, secret)
			}
		}
	}
	transcript, err := Claude.Transcript(record.SourcePath)
	if err != nil {
		t.Fatal(err)
	}
	transcriptJSON, err := json.Marshal(transcript)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(transcriptJSON), secrets[0]) {
		t.Fatal("detail transcript did not retain the local message body")
	}

	for _, id := range []string{"aaaaaaaa-aaaa-4aaa-8aaa-00000000000a", "44444444-4444-4444-8444-000000000004", "66666666-6666-4666-8666-000000000006"} {
		malformed, parseErr := Claude.ParseFile(edgePath(id))
		diagnostic := strings.Join(malformed.Errors, " ")
		if parseErr != nil {
			diagnostic += " " + parseErr.Error()
		}
		if strings.Contains(diagnostic, "BODY-SECRET") {
			t.Errorf("diagnostic for %s disclosed a native body: %q", id, diagnostic)
		}
	}
}

func TestClaudeTranscriptByteBounds(t *testing.T) {
	t.Run("oversized native line is skipped", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "oversized.jsonl")
		contents := fmt.Sprintf(`{"type":"user","timestamp":"2026-07-12T09:00:00Z","message":{"role":"user","content":%q}}`, strings.Repeat("x", maxLineBytes)) + "\n" +
			`{"type":"user","timestamp":"2026-07-12T09:01:00Z","message":{"role":"user","content":"survives"}}` + "\n"
		if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
			t.Fatal(err)
		}
		result, err := Claude.Transcript(path)
		if err != nil {
			t.Fatal(err)
		}
		if len(result.Entries) != 1 || result.Entries[0].Text != "survives" || result.Entries[0].Ref != 2 {
			t.Fatalf("entries = %#v", result.Entries)
		}
	})

	t.Run("entry text is capped on a rune boundary", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "entry.jsonl")
		body := strings.Repeat("🙂", maxEntryBytes/2)
		line := fmt.Sprintf(`{"type":"user","timestamp":"2026-07-12T09:00:00Z","message":{"role":"user","content":%q}}`, body) + "\n"
		if err := os.WriteFile(path, []byte(line), 0o600); err != nil {
			t.Fatal(err)
		}
		result, err := Claude.Transcript(path)
		if err != nil {
			t.Fatal(err)
		}
		if len(result.Entries) != 1 || len(result.Entries[0].Text) > maxEntryBytes+64 || !utf8.ValidString(result.Entries[0].Text) || !strings.Contains(result.Entries[0].Text, "text truncated") {
			t.Fatalf("capped entry length/validity = %d/%v", len(result.Entries[0].Text), utf8.ValidString(result.Entries[0].Text))
		}
	})

	t.Run("total rendered text is bounded", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "total.jsonl")
		file, err := os.Create(path)
		if err != nil {
			t.Fatal(err)
		}
		body := strings.Repeat("y", 60*1024)
		for i := 0; i < 60; i++ {
			_, _ = fmt.Fprintf(file, `{"type":"user","timestamp":"2026-07-12T09:00:00Z","message":{"role":"user","content":%q}}`+"\n", body)
		}
		_ = file.Close()
		result, err := Claude.Transcript(path)
		if err != nil {
			t.Fatal(err)
		}
		total := 0
		for _, entry := range result.Entries {
			total += len(entry.Text)
		}
		if !result.Truncated || result.OmittedEntries == 0 || total > maxTotalBytes {
			t.Fatalf("truncated/omitted/text bytes = %v/%d/%d", result.Truncated, result.OmittedEntries, total)
		}
	})
}

func TestClaudeDiscoveryIgnoresNeighborJSONL(t *testing.T) {
	root := t.TempDir()
	paths := []string{"project/root.jsonl", "project/root/subagents/agent-child.jsonl", "project/root/workflows/no.jsonl", "project/root/subagents/workflows/no.jsonl"}
	for _, rel := range paths {
		path := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("{}\n"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	found, err := Claude.ListSessionFiles(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 2 {
		t.Fatalf("found=%v", found)
	}
}
