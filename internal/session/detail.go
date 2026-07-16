package session

import "sort"

func DetailFromRecord(rec Record) Detail {
	detail := Detail{SessionID: rec.Meta.SessionID, ParentSessionID: rec.Meta.ParentSessionID, ThreadSource: rec.Meta.ThreadSource, AgentRole: rec.Meta.AgentRole, AgentNickname: rec.Meta.AgentNickname, Model: rec.Meta.Model, ModelProvider: rec.Meta.ModelProvider, CLIVersion: rec.Meta.CLIVersion, Cwd: rec.Meta.Cwd, SourcePath: rec.SourcePath, EndedAt: utc(rec.EndedAt), Status: rec.Status, Confidence: rec.Confidence, Usage: rec.Usage, Events: append([]Event{}, rec.Events...), Errors: append([]string{}, rec.Errors...)}
	if !rec.Meta.StartedAt.IsZero() {
		at := rec.Meta.StartedAt.UTC()
		detail.StartedAt = &at
	}
	for i := range detail.Events {
		detail.Events[i].At = detail.Events[i].At.UTC()
	}
	return detail
}
func EventKindCounts(events []Event) []KindCount {
	counts := map[string]int{}
	for _, event := range events {
		counts[event.Kind]++
	}
	kinds := make([]string, 0, len(counts))
	for kind := range counts {
		kinds = append(kinds, kind)
	}
	sort.Strings(kinds)
	result := make([]KindCount, 0, len(kinds))
	for _, kind := range kinds {
		result = append(result, KindCount{kind, counts[kind]})
	}
	return result
}

func Transcript(provider Provider, path string) (TranscriptResult, error) {
	return provider.Transcript(path)
}
