// Package session projects native Claude Code JSONL into read-only TraceUI models.
package session

import (
	"errors"
	"time"
)

const SchemaSessionTreeV1 = "traceui.session-tree/v1"

var ErrSessionNotFound = errors.New("session: session not found")

type Status string

const (
	StatusCompleted Status = "completed"
	StatusAborted   Status = "aborted"
	StatusActive    Status = "active"
	StatusMissing   Status = "missing"
	StatusMalformed Status = "malformed"
)

type Confidence string

const (
	ConfidenceFull    Confidence = "full"
	ConfidencePartial Confidence = "partial"
	ConfidenceNone    Confidence = "none"
)

type Usage struct {
	InputTokens           int64 `json:"input_tokens"`
	CachedInputTokens     int64 `json:"cached_input_tokens"`
	OutputTokens          int64 `json:"output_tokens"`
	ReasoningOutputTokens int64 `json:"reasoning_output_tokens"`
	TotalTokens           int64 `json:"total_tokens"`
}

type Meta struct {
	SessionID       string
	ParentSessionID string
	ThreadSource    string
	AgentRole       string
	AgentNickname   string
	Model           string
	ModelProvider   string
	CLIVersion      string
	Cwd             string
	StartedAt       time.Time
}

type EventRef struct {
	SourcePath string `json:"source_path"`
	Line       int    `json:"line"`
}
type Event struct {
	Kind string    `json:"kind"`
	At   time.Time `json:"at"`
	Ref  EventRef  `json:"ref"`
}
type ChildSpawn struct {
	ChildSessionID, AgentRole, AgentNickname string
	SpawnedAt                                time.Time
	Ref                                      EventRef
}

type Record struct {
	Meta            Meta
	SourcePath      string
	Status          Status
	Confidence      Confidence
	EndedAt         *time.Time
	LastActivityAt  *time.Time
	Usage           *Usage
	AliasSessionIDs []string
	ChildSpawns     []ChildSpawn
	Events          []Event
	Errors          []string
}

type FileSummary struct {
	Meta           Meta
	Status         Status
	EndedAt        *time.Time
	LastActivityAt *time.Time
	Model          string
	Usage          *Usage
	Confidence     Confidence
	Errors         []string
}

type Node struct {
	SessionID       string
	ParentSessionID string
	AgentPath       string
	StartedAt       *time.Time
	EndedAt         *time.Time
	Status          Status
	Depth           int
	Order           int
	Model           string
	Usage           *Usage
	SourcePath      string
	Confidence      Confidence
	Children        []*Node
}

type Tree struct{ Root *Node }

func (tree Tree) Walk(visit func(*Node)) {
	var walk func(*Node)
	walk = func(node *Node) {
		if node == nil {
			return
		}
		visit(node)
		for _, child := range node.Children {
			walk(child)
		}
	}
	walk(tree.Root)
}

type ExportNode struct {
	SessionID       string     `json:"session_id"`
	ParentSessionID string     `json:"parent_session_id,omitempty"`
	AgentPath       string     `json:"agent_path"`
	StartedAt       *time.Time `json:"started_at"`
	EndedAt         *time.Time `json:"ended_at"`
	Status          Status     `json:"status"`
	Depth           int        `json:"depth"`
	Order           int        `json:"order"`
	Model           string     `json:"model,omitempty"`
	Usage           *Usage     `json:"usage"`
	SourcePath      string     `json:"source_path,omitempty"`
	Confidence      Confidence `json:"confidence"`
}

type ExportDoc struct {
	Schema string       `json:"schema"`
	Nodes  []ExportNode `json:"nodes"`
}

type Detail struct {
	SessionID       string     `json:"session_id"`
	ParentSessionID string     `json:"parent_session_id,omitempty"`
	ThreadSource    string     `json:"thread_source,omitempty"`
	AgentRole       string     `json:"agent_role,omitempty"`
	AgentNickname   string     `json:"agent_nickname,omitempty"`
	Model           string     `json:"model,omitempty"`
	ModelProvider   string     `json:"model_provider,omitempty"`
	CLIVersion      string     `json:"cli_version,omitempty"`
	Cwd             string     `json:"cwd,omitempty"`
	SourcePath      string     `json:"source_path,omitempty"`
	StartedAt       *time.Time `json:"started_at"`
	EndedAt         *time.Time `json:"ended_at"`
	Status          Status     `json:"status"`
	Confidence      Confidence `json:"confidence"`
	Usage           *Usage     `json:"usage"`
	Events          []Event    `json:"events"`
	Errors          []string   `json:"errors,omitempty"`
}

type KindCount struct {
	Kind  string
	Count int
}

type TranscriptEntry struct {
	Role    string    `json:"role"`
	At      time.Time `json:"at"`
	Summary string    `json:"summary"`
	Text    string    `json:"text"`
	Ref     int       `json:"ref"`
}
type TranscriptResult struct {
	Entries        []TranscriptEntry
	Truncated      bool
	OmittedEntries int
}
