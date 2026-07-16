// Package traceui serves a loopback-only, read-only view of Claude Code sessions.
package traceui

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/djfrsn/maestro-mini/internal/session"
)

const (
	DefaultAddr      = "127.0.0.1:7777"
	defaultPageLimit = 200
	maxPageLimit     = 500
)

type Options struct {
	Provider          session.Provider
	Root              string
	Addr              string
	PollInterval      time.Duration
	KeepAliveInterval time.Duration
}

type Server struct {
	addr              string
	addrMu            sync.RWMutex
	pollInterval      time.Duration
	keepAliveInterval time.Duration
	cache             *cache
	events            *broadcaster
	mux               *http.ServeMux
	site              *site
}

func New(options Options) (*Server, error) {
	if options.Provider == nil {
		return nil, errors.New("traceui: Provider is required")
	}
	if options.Root == "" {
		return nil, errors.New("traceui: Root is required")
	}
	if options.Addr == "" {
		options.Addr = DefaultAddr
	}
	if options.PollInterval <= 0 {
		options.PollInterval = 2 * time.Second
	}
	if options.KeepAliveInterval <= 0 {
		options.KeepAliveInterval = 15 * time.Second
	}
	webSite, err := loadSite()
	if err != nil {
		return nil, err
	}
	server := &Server{addr: options.Addr, pollInterval: options.PollInterval, keepAliveInterval: options.KeepAliveInterval, cache: newCache(options.Provider, options.Root), events: newBroadcaster(), site: webSite}
	server.mux = http.NewServeMux()
	server.mux.HandleFunc("GET /api/v1/sessions", server.handleList)
	server.mux.HandleFunc("GET /api/v1/sessions/{id}/tree", server.handleTree)
	server.mux.HandleFunc("GET /api/v1/sessions/{id}/detail", server.handleDetail)
	server.mux.HandleFunc("GET /api/v1/events", server.handleEvents)
	server.mux.HandleFunc("GET /{$}", server.handleIndex)
	server.mux.Handle("GET /assets/", http.StripPrefix("/", http.FileServerFS(webSite.files)))
	if _, err := server.cache.refresh(time.Now()); err != nil {
		return nil, err
	}
	return server, nil
}

func (server *Server) Addr() string {
	server.addrMu.RLock()
	defer server.addrMu.RUnlock()
	return server.addr
}
func (server *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { server.mux.ServeHTTP(w, r) }

func (server *Server) Run(ctx context.Context, ready func(string)) error {
	listener, err := net.Listen("tcp", server.addr)
	if err != nil {
		return err
	}
	server.addrMu.Lock()
	server.addr = listener.Addr().String()
	server.addrMu.Unlock()
	if ready != nil {
		ready(server.Addr())
	}
	go server.poll(ctx)
	httpServer := &http.Server{Handler: server, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdown)
	}()
	err = httpServer.Serve(listener)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func (server *Server) poll(ctx context.Context) {
	ticker := time.NewTicker(server.pollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			changed, _ := server.cache.refresh(time.Now())
			if changed {
				server.events.broadcast(changedFrame(server.cache.current().asOf))
			}
		}
	}
}

func changedFrame(at time.Time) string {
	return fmt.Sprintf("event: changed\ndata: {\"as_of\":%q}\n\n", formatInstant(at))
}
func formatInstant(at time.Time) string { return at.UTC().Format(time.RFC3339Nano) }

type listResponse struct {
	Sessions   []RootSummary `json:"sessions"`
	NextCursor *string       `json:"next_cursor"`
	Totals     Totals        `json:"totals"`
}

// Totals reports dataset-wide aggregates for the full session set. They are
// computed over every root, independent of the page a request lands on, so the
// same numbers appear on page one, on any later page, and in the server-rendered
// bootstrap. This keeps the API and the UI in agreement regardless of paging.
type Totals struct {
	Sessions    int   `json:"sessions"`
	Active      int   `json:"active"`
	TotalTokens int64 `json:"total_tokens"`
}

func computeTotals(rows []RootSummary) Totals {
	result := Totals{Sessions: len(rows)}
	for _, row := range rows {
		if row.Status == session.StatusActive {
			result.Active++
		}
		if row.Usage != nil {
			result.TotalTokens += row.Usage.TotalTokens
		}
	}
	return result
}

type treeResponse struct {
	AsOf     string            `json:"as_of"`
	Document session.ExportDoc `json:"document"`
}
type detailResponse struct {
	AsOf   string     `json:"as_of"`
	Detail detailBody `json:"detail"`
}
type detailBody struct {
	session.Detail
	EventKindCounts          map[string]int            `json:"event_kind_counts"`
	Transcript               []session.TranscriptEntry `json:"transcript"`
	TranscriptTruncated      bool                      `json:"transcript_truncated"`
	TranscriptOmittedEntries int                       `json:"transcript_omitted_entries"`
}

func (server *Server) handleList(w http.ResponseWriter, request *http.Request) {
	limit := defaultPageLimit
	if raw := request.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			writeError(w, 400, "limit must be a positive integer")
			return
		}
		limit = min(parsed, maxPageLimit)
	}
	allRows := server.cache.current().rows
	rows := allRows
	if raw := request.URL.Query().Get("cursor"); raw != "" {
		at, id, err := decodeCursor(raw)
		if err != nil {
			writeError(w, 400, "invalid cursor")
			return
		}
		rows = filterRows(rows, func(row RootSummary) bool {
			start := rowStart(row)
			if !start.Equal(at) {
				return start.Before(at)
			}
			return row.SessionID < id
		})
	}
	response := listResponse{Sessions: rows, Totals: computeTotals(allRows)}
	if len(rows) > limit {
		response.Sessions = rows[:limit]
		value := encodeCursor(rows[limit-1])
		response.NextCursor = &value
	}
	if response.Sessions == nil {
		response.Sessions = []RootSummary{}
	}
	writeJSON(w, 200, response)
}

func (server *Server) handleTree(w http.ResponseWriter, request *http.Request) {
	snap := server.cache.current()
	if snap.store == nil {
		writeError(w, 404, "session not found")
		return
	}
	record, err := snap.store.Resolve(request.PathValue("id"))
	if err != nil && record.Status != session.StatusMalformed {
		writeError(w, 404, "session not found")
		return
	}
	tree, err := snap.store.BuildTree(record)
	if err != nil {
		writeError(w, 500, "tree unavailable")
		return
	}
	writeJSON(w, 200, treeResponse{formatInstant(snap.asOf), session.Export(tree)})
}

func (server *Server) handleDetail(w http.ResponseWriter, request *http.Request) {
	snap := server.cache.current()
	if snap.store == nil {
		writeError(w, 404, "session not found")
		return
	}
	record, err := snap.store.Resolve(request.PathValue("id"))
	if err != nil && record.Status != session.StatusMalformed {
		writeError(w, 404, "session not found")
		return
	}
	counts := map[string]int{}
	for _, count := range session.EventKindCounts(record.Events) {
		counts[count.Kind] = count.Count
	}
	transcript, _ := server.cache.provider.Transcript(record.SourcePath)
	if transcript.Entries == nil {
		transcript.Entries = []session.TranscriptEntry{}
	}
	writeJSON(w, 200, detailResponse{formatInstant(snap.asOf), detailBody{session.DetailFromRecord(record), counts, transcript.Entries, transcript.Truncated, transcript.OmittedEntries}})
}

func (server *Server) handleEvents(w http.ResponseWriter, request *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, 500, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = io.WriteString(w, ": connected\n\n")
	flusher.Flush()
	stream := server.events.subscribe()
	defer server.events.unsubscribe(stream)
	keepAlive := time.NewTicker(server.keepAliveInterval)
	defer keepAlive.Stop()
	for {
		select {
		case <-request.Context().Done():
			return
		case frame, open := <-stream:
			if !open {
				return
			}
			if _, err := io.WriteString(w, frame); err != nil {
				return
			}
			flusher.Flush()
		case <-keepAlive.C:
			if _, err := io.WriteString(w, ": keep-alive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func (server *Server) handleIndex(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	page, err := server.site.render(server.cache.current())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "page unavailable")
		return
	}
	_, _ = w.Write(page)
}
func encodeCursor(row RootSummary) string {
	return base64.RawURLEncoding.EncodeToString([]byte(rowStart(row).UTC().Format(time.RFC3339Nano) + "|" + row.SessionID))
}
func decodeCursor(raw string) (time.Time, string, error) {
	bytes, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return time.Time{}, "", err
	}
	parts := strings.SplitN(string(bytes), "|", 2)
	if len(parts) != 2 {
		return time.Time{}, "", errors.New("missing separator")
	}
	at, err := time.Parse(time.RFC3339Nano, parts[0])
	return at, parts[1], err
}
func filterRows(rows []RootSummary, keep func(RootSummary) bool) []RootSummary {
	result := make([]RootSummary, 0, len(rows))
	for _, row := range rows {
		if keep(row) {
			result = append(result, row)
		}
	}
	return result
}
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
