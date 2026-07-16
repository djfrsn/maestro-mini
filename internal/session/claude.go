package session

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type claudeProvider struct{}

func (claudeProvider) Name() string { return "claude" }

func (claudeProvider) ListSessionFiles(root string) ([]string, error) {
	var paths []string
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		parts := strings.Split(filepath.ToSlash(rel), "/")
		base := parts[len(parts)-1]
		if (len(parts) == 2 && strings.HasSuffix(base, ".jsonl")) ||
			(len(parts) == 4 && parts[2] == "subagents" && strings.HasPrefix(base, "agent-") && strings.HasSuffix(base, ".jsonl")) {
			paths = append(paths, path)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("session: list Claude sessions under %s: %w", root, err)
	}
	sort.Strings(paths)
	return paths, nil
}

func identity(path string) (id, parent, source string) {
	stem := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	dir := filepath.Dir(path)
	if filepath.Base(dir) == "subagents" && strings.HasPrefix(stem, "agent-") {
		return strings.TrimPrefix(stem, "agent-"), filepath.Base(filepath.Dir(dir)), "subagent"
	}
	return stem, "", "user"
}

func (claudeProvider) MatchesSessionID(path, sessionID string) bool {
	id, _, _ := identity(path)
	return id == sessionID
}

type nativeLine struct {
	Type             string          `json:"type"`
	Timestamp        string          `json:"timestamp"`
	SessionID        string          `json:"sessionId"`
	AgentID          string          `json:"agentId"`
	Cwd              string          `json:"cwd"`
	Version          string          `json:"version"`
	AttributionAgent string          `json:"attributionAgent"`
	IsMeta           bool            `json:"isMeta"`
	Message          *nativeMessage  `json:"message"`
	ToolUseResult    json.RawMessage `json:"toolUseResult"`
}
type nativeMessage struct {
	Role       string          `json:"role"`
	Model      string          `json:"model"`
	StopReason string          `json:"stop_reason"`
	Content    json.RawMessage `json:"content"`
	Usage      *nativeUsage    `json:"usage"`
}
type nativeUsage struct {
	InputTokens   int64 `json:"input_tokens"`
	OutputTokens  int64 `json:"output_tokens"`
	CacheCreation int64 `json:"cache_creation_input_tokens"`
	CacheRead     int64 `json:"cache_read_input_tokens"`
}
type nativeItem struct {
	Type      string `json:"type"`
	ID        string `json:"id"`
	Name      string `json:"name"`
	ToolUseID string `json:"tool_use_id"`
	Text      string `json:"text"`
	Thinking  string `json:"thinking"`
	Input     struct {
		SubagentType string `json:"subagent_type"`
	} `json:"input"`
	Content json.RawMessage `json:"content"`
}
type agentResult struct {
	AgentID   string `json:"agentId"`
	AgentType string `json:"agentType"`
}

func (claudeProvider) ScanMeta(path string) (Meta, error) {
	id, parent, source := identity(path)
	meta := Meta{SessionID: id, ParentSessionID: parent, ThreadSource: source}
	f, err := os.Open(path)
	if err != nil {
		return Meta{}, fmt.Errorf("session: open %s: %w", path, err)
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	s.Buffer(make([]byte, 64*1024), 4*1024*1024)
	seen := 0
	for s.Scan() && seen < 32 {
		if len(bytes.TrimSpace(s.Bytes())) == 0 {
			continue
		}
		seen++
		var line nativeLine
		if err := json.Unmarshal(s.Bytes(), &line); err != nil || line.Type == "" {
			if seen == 1 {
				return Meta{}, fmt.Errorf("session: %s: invalid Claude record", path)
			}
			continue
		}
		if meta.StartedAt.IsZero() {
			meta.StartedAt, _ = time.Parse(time.RFC3339, line.Timestamp)
		}
		if meta.Cwd == "" {
			meta.Cwd = line.Cwd
		}
		if meta.CLIVersion == "" {
			meta.CLIVersion = line.Version
		}
		if meta.AgentRole == "" {
			meta.AgentRole = line.AttributionAgent
		}
	}
	if seen == 0 {
		return Meta{}, fmt.Errorf("session: %s: empty Claude session", path)
	}
	if err := s.Err(); err != nil {
		return Meta{}, fmt.Errorf("session: read %s: %w", path, err)
	}
	return meta, nil
}

func (claudeProvider) ParseFile(path string) (Record, error) {
	f, err := os.Open(path)
	if err != nil {
		return Record{SourcePath: path, Status: StatusMalformed, Confidence: ConfidenceNone, Errors: []string{"session source unreadable"}}, fmt.Errorf("session: open %s: %w", path, err)
	}
	defer f.Close()
	id, parent, source := identity(path)
	rec := Record{Meta: Meta{SessionID: id, ParentSessionID: parent, ThreadSource: source}, SourcePath: path, Confidence: ConfidenceFull}
	s := bufio.NewScanner(f)
	s.Buffer(make([]byte, 64*1024), 4*1024*1024)
	lineNo, records := 0, 0
	aliases := map[string]bool{}
	pending := map[string]ChildSpawn{}
	children := map[string]bool{}
	var lastAt, interruptedAt time.Time
	var stop string
	sawAssistant, pendingPrompt, interrupted := false, false, false
	for s.Scan() {
		lineNo++
		if len(bytes.TrimSpace(s.Bytes())) == 0 {
			continue
		}
		var line nativeLine
		if err := json.Unmarshal(s.Bytes(), &line); err != nil || line.Type == "" {
			if records == 0 {
				rec.Status = StatusMalformed
				rec.Confidence = ConfidenceNone
				rec.Errors = []string{"line 1: unparseable record"}
				return rec, fmt.Errorf("session: %s line 1: invalid Claude record", path)
			}
			rec.Confidence = ConfidencePartial
			addError(&rec, fmt.Sprintf("line %d: unparseable record skipped", lineNo))
			continue
		}
		records++
		at, tsErr := time.Parse(time.RFC3339, line.Timestamp)
		if line.Timestamp != "" && tsErr != nil {
			rec.Confidence = ConfidencePartial
			addError(&rec, fmt.Sprintf("line %d: invalid timestamp", lineNo))
		}
		if tsErr == nil {
			lastAt = at
			if rec.Meta.StartedAt.IsZero() {
				rec.Meta.StartedAt = at
			}
		}
		if rec.Meta.Cwd == "" {
			rec.Meta.Cwd = line.Cwd
		}
		if rec.Meta.CLIVersion == "" {
			rec.Meta.CLIVersion = line.Version
		}
		if rec.Meta.AgentRole == "" {
			rec.Meta.AgentRole = line.AttributionAgent
		}
		if parent == "" && line.SessionID != "" && line.SessionID != id && !aliases[line.SessionID] {
			aliases[line.SessionID] = true
			rec.AliasSessionIDs = append(rec.AliasSessionIDs, line.SessionID)
		}
		ref := EventRef{SourcePath: path, Line: lineNo}
		switch line.Type {
		case "assistant":
			sawAssistant = true
			pendingPrompt = false
			interrupted = false
			if line.Message == nil {
				continue
			}
			if line.Message.Model != "" {
				rec.Meta.Model = line.Message.Model
			}
			stop = line.Message.StopReason
			addUsage(&rec, line.Message.Usage)
			items := contentItems(line.Message.Content)
			toolCount := 0
			for _, item := range items {
				if item.Type != "tool_use" || item.Name == "" {
					continue
				}
				toolCount++
				kind := "tool:" + bounded(item.Name)
				if item.Name == "Agent" {
					kind = "delegation:Agent"
					if item.ID != "" {
						pending[item.ID] = ChildSpawn{AgentRole: item.Input.SubagentType, SpawnedAt: at, Ref: ref}
					}
				}
				rec.Events = append(rec.Events, Event{Kind: kind, At: at, Ref: ref})
			}
			if toolCount == 0 {
				rec.Events = append(rec.Events, Event{Kind: "native:assistant", At: at, Ref: ref})
			}
		case "user":
			rec.Events = append(rec.Events, Event{Kind: "native:user", At: at, Ref: ref})
			if line.Message != nil && isClaudeInterruptMarker(line.Message.Content) {
				interrupted = true
				interruptedAt = at
				pendingPrompt = false
				continue
			}
			pendingPrompt = submittedPrompt(line)
			if pendingPrompt {
				interrupted = false
			}
			if line.Message == nil {
				continue
			}
			for _, item := range contentItems(line.Message.Content) {
				if item.Type != "tool_result" {
					continue
				}
				spawn, ok := pending[item.ToolUseID]
				if !ok {
					continue
				}
				delete(pending, item.ToolUseID)
				var result agentResult
				_ = json.Unmarshal(line.ToolUseResult, &result)
				if result.AgentID == "" || children[result.AgentID] {
					continue
				}
				children[result.AgentID] = true
				spawn.ChildSessionID = result.AgentID
				if spawn.AgentRole == "" {
					spawn.AgentRole = result.AgentType
				}
				rec.ChildSpawns = append(rec.ChildSpawns, spawn)
			}
		default:
			rec.Events = append(rec.Events, Event{Kind: "native:" + bounded(line.Type), At: at, Ref: ref})
		}
	}
	if err := s.Err(); err != nil {
		rec.Confidence = ConfidencePartial
		addError(&rec, "session source read failed")
	}
	if records == 0 {
		rec.Status = StatusMalformed
		rec.Confidence = ConfidenceNone
		addError(&rec, "no Claude session records found")
		return rec, fmt.Errorf("session: %s: empty Claude session", path)
	}
	switch {
	case interrupted:
		rec.Status = StatusAborted
		ended := interruptedAt
		if ended.IsZero() {
			ended = lastAt
		}
		if !ended.IsZero() {
			rec.EndedAt = &ended
		}
	case pendingPrompt || (sawAssistant && !isTerminalClaudeStopReason(stop)):
		rec.Status = StatusActive
	default:
		rec.Status = StatusCompleted
		if !lastAt.IsZero() {
			ended := lastAt
			rec.EndedAt = &ended
		}
	}
	if !lastAt.IsZero() {
		activity := lastAt
		rec.LastActivityAt = &activity
	}
	return rec, nil
}

const (
	claudeUserInterrupt    = "[Request interrupted by user]"
	claudeToolUseInterrupt = "[Request interrupted by user for tool use]"
)

func isClaudeInterruptMarker(content json.RawMessage) bool {
	text, ok := claudeSoleText(content)
	return ok && (text == claudeUserInterrupt || text == claudeToolUseInterrupt)
}

func claudeSoleText(content json.RawMessage) (string, bool) {
	if len(content) == 0 {
		return "", false
	}
	if content[0] == '"' {
		var text string
		if err := json.Unmarshal(content, &text); err != nil {
			return "", false
		}
		return strings.TrimSpace(text), true
	}
	items := contentItems(content)
	if len(items) != 1 || items[0].Type != "text" {
		return "", false
	}
	return strings.TrimSpace(items[0].Text), true
}

func isTerminalClaudeStopReason(stopReason string) bool {
	switch stopReason {
	case "end_turn", "stop_sequence", "max_tokens", "refusal", "model_context_window_exceeded":
		return true
	default:
		return false
	}
}

func (provider claudeProvider) Summarize(path string) (FileSummary, error) {
	rec, err := provider.ParseFile(path)
	return FileSummary{Meta: rec.Meta, Status: rec.Status, EndedAt: rec.EndedAt, LastActivityAt: rec.LastActivityAt, Model: rec.Meta.Model, Usage: rec.Usage, Confidence: rec.Confidence, Errors: rec.Errors}, err
}

func contentItems(raw json.RawMessage) []nativeItem {
	if len(raw) == 0 || raw[0] != '[' {
		return nil
	}
	var items []nativeItem
	_ = json.Unmarshal(raw, &items)
	return items
}
func submittedPrompt(line nativeLine) bool {
	if line.Message == nil || line.IsMeta {
		return false
	}
	if len(contentItems(line.Message.Content)) > 0 {
		for _, i := range contentItems(line.Message.Content) {
			if i.Type != "tool_result" {
				return true
			}
		}
		return false
	}
	var text string
	if json.Unmarshal(line.Message.Content, &text) != nil {
		return len(bytes.TrimSpace(line.Message.Content)) > 2
	}
	text = strings.TrimSpace(text)
	return text != "" && !strings.HasPrefix(text, "<command-name>") && !strings.HasPrefix(text, "<local-command-")
}
func addUsage(rec *Record, u *nativeUsage) {
	if u == nil {
		return
	}
	if rec.Usage == nil {
		rec.Usage = &Usage{}
	}
	input := u.InputTokens + u.CacheCreation + u.CacheRead
	rec.Usage.InputTokens += input
	rec.Usage.CachedInputTokens += u.CacheRead
	rec.Usage.OutputTokens += u.OutputTokens
	rec.Usage.TotalTokens += input + u.OutputTokens
}
func addError(rec *Record, msg string) {
	if len(rec.Errors) < 20 {
		rec.Errors = append(rec.Errors, msg)
	}
}
func bounded(s string) string {
	if len(s) > 128 {
		return s[:128]
	}
	return s
}
