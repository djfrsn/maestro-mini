package session

type Provider interface {
	Name() string
	ListSessionFiles(root string) ([]string, error)
	ScanMeta(path string) (Meta, error)
	ParseFile(path string) (Record, error)
	Summarize(path string) (FileSummary, error)
	Transcript(path string) (TranscriptResult, error)
	MatchesSessionID(path, sessionID string) bool
}

var Claude Provider = claudeProvider{}
