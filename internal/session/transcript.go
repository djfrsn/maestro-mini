package session

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	maxLineBytes   = 4 * 1024 * 1024
	maxEntryBytes  = 64 * 1024
	maxHeadEntries = 100
	maxTailEntries = 100
	maxTotalBytes  = 2 * 1024 * 1024
)

func (claudeProvider) Transcript(path string) (TranscriptResult, error) {
	f, err := os.Open(path)
	if err != nil {
		return TranscriptResult{}, fmt.Errorf("session: open transcript source %s: %w", path, err)
	}
	defer f.Close()
	w := &transcriptWindow{}
	reader := bufio.NewReaderSize(f, 64*1024)
	lineNo := 0
	for {
		line, oversized, readErr := readLine(reader)
		if len(line) == 0 && !oversized && readErr != nil {
			break
		}
		lineNo++
		if !oversized {
			for _, entry := range transcriptEntries(line, lineNo) {
				w.add(entry)
			}
		}
		if readErr != nil {
			if readErr != io.EOF {
				return w.finish(), fmt.Errorf("session: read transcript source %s: %w", path, readErr)
			}
			break
		}
	}
	return w.finish(), nil
}

func readLine(reader *bufio.Reader) (line []byte, oversized bool, err error) {
	for {
		chunk, chunkErr := reader.ReadSlice('\n')
		if !oversized {
			if len(line)+len(chunk) > maxLineBytes {
				oversized = true
				line = nil
			} else {
				line = append(line, chunk...)
			}
		}
		if chunkErr == bufio.ErrBufferFull {
			continue
		}
		return line, oversized, chunkErr
	}
}

type transcriptLine struct {
	Type, Timestamp string
	IsMeta          bool `json:"isMeta"`
	Message         *struct {
		Role    string          `json:"role"`
		Content json.RawMessage `json:"content"`
	} `json:"message"`
	ToolUseResult json.RawMessage `json:"toolUseResult"`
}
type transcriptItem struct {
	Type, Name, Text, Thinking string
	Input, Content             json.RawMessage
}
type toolIO struct{ Stdout, Stderr string }

func transcriptEntries(raw []byte, lineNo int) []TranscriptEntry {
	var line transcriptLine
	if json.Unmarshal(raw, &line) != nil || line.Message == nil || (line.Type != "user" && line.Type != "assistant") {
		return nil
	}
	at, _ := time.Parse(time.RFC3339, line.Timestamp)
	build := func(role, text string) TranscriptEntry {
		text = capText(text)
		return TranscriptEntry{role, at.UTC(), summary(text), text, lineNo}
	}
	role := line.Message.Role
	if line.Type == "user" && line.IsMeta {
		role = "context"
	}
	if len(line.Message.Content) > 0 && line.Message.Content[0] == '"' {
		var text string
		if json.Unmarshal(line.Message.Content, &text) == nil && text != "" {
			return []TranscriptEntry{build(role, text)}
		}
		return nil
	}
	var items []transcriptItem
	if json.Unmarshal(line.Message.Content, &items) != nil {
		return nil
	}
	var entries []TranscriptEntry
	for _, item := range items {
		switch item.Type {
		case "text":
			if item.Text != "" {
				entries = append(entries, build(role, item.Text))
			}
		case "thinking":
			if item.Thinking != "" {
				entries = append(entries, build("thinking", item.Thinking))
			}
		case "tool_use":
			if item.Name != "" {
				entries = append(entries, build("tool:"+bounded(item.Name), rawText(item.Input)))
			}
		case "tool_result":
			entries = append(entries, build("tool_result", toolResultText(item.Content, line.ToolUseResult)))
		}
	}
	return entries
}
func toolResultText(content, result json.RawMessage) string {
	if text := contentText(content); text != "" {
		return text
	}
	var pair toolIO
	_ = json.Unmarshal(result, &pair)
	if pair.Stderr == "" {
		return pair.Stdout
	}
	if pair.Stdout == "" {
		return "[stderr]\n" + pair.Stderr
	}
	return pair.Stdout + "\n[stderr]\n" + pair.Stderr
}
func contentText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	if raw[0] == '"' {
		var text string
		_ = json.Unmarshal(raw, &text)
		return text
	}
	var items []transcriptItem
	if json.Unmarshal(raw, &items) != nil {
		return ""
	}
	var parts []string
	for _, item := range items {
		if item.Type == "text" && item.Text != "" {
			parts = append(parts, item.Text)
		}
	}
	return strings.Join(parts, "\n")
}
func rawText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var value any
	if json.Unmarshal(raw, &value) != nil {
		return ""
	}
	data, _ := json.MarshalIndent(value, "", "  ")
	return string(data)
}

type transcriptWindow struct {
	head, tail []TranscriptEntry
	omitted    int
}

func (w *transcriptWindow) add(entry TranscriptEntry) {
	if len(w.head) < maxHeadEntries {
		w.head = append(w.head, entry)
		return
	}
	if len(w.tail) == maxTailEntries {
		w.tail = w.tail[1:]
		w.omitted++
	}
	w.tail = append(w.tail, entry)
}
func (w *transcriptWindow) finish() TranscriptResult {
	entries := append([]TranscriptEntry{}, w.head...)
	omitted := w.omitted
	if omitted > 0 {
		entries = append(entries, marker(omitted))
	}
	entries = append(entries, w.tail...)
	total := 0
	for i, entry := range entries {
		total += len(entry.Text)
		if total <= maxTotalBytes {
			continue
		}
		dropped := 0
		for _, rest := range entries[i:] {
			if rest.Role != "marker" {
				dropped++
			}
		}
		omitted += dropped
		entries = append(entries[:i], marker(dropped))
		break
	}
	if entries == nil {
		entries = []TranscriptEntry{}
	}
	return TranscriptResult{entries, omitted > 0, omitted}
}
func marker(count int) TranscriptEntry {
	return TranscriptEntry{Role: "marker", Summary: fmt.Sprintf("… %d entries omitted …", count)}
}
func capText(text string) string {
	if len(text) <= maxEntryBytes {
		return text
	}
	limit := maxEntryBytes
	for limit > 0 && !utf8.RuneStart(text[limit]) {
		limit--
	}
	return text[:limit] + "\n… [text truncated at 64KB]"
}
func summary(text string) string {
	text = strings.Join(strings.Fields(text), " ")
	runes := []rune(text)
	if len(runes) > 120 {
		return string(runes[:120]) + "…"
	}
	return text
}
