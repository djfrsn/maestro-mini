package traceui

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"io/fs"
)

//go:embed web
var embeddedWeb embed.FS

type manifest struct {
	JS  string `json:"js"`
	CSS string `json:"css"`
}

type site struct {
	files    fs.FS
	manifest manifest
}

type shellData struct {
	CSS       string
	JS        string
	Bootstrap template.JS
	Rows      []RootSummary
}

var shell = template.Must(template.New("shell").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TraceUI</title><link rel="stylesheet" href="/{{.CSS}}"></head><body>
<div id="app"><header><div class="brand"><span class="mark">T</span><h1>Trace<small>UI</small></h1></div></header><main><section class="sessions">
{{range .Rows}}<article class="session"><button class="session-main" type="button"><span class="status status-{{.Status}}">{{.Status}}</span><span class="identity"><strong>{{.SessionID}}</strong><small>{{.Model}}</small></span><span class="span"><strong>Loading time span…</strong></span><span class="metric"><strong>{{.NodeCount}}</strong><small>sessions</small></span><span class="metric">{{if .Usage}}<strong>{{.Usage.TotalTokens}}</strong>{{end}}<small>tokens</small></span></button></article>{{end}}
</section></main></div><script id="traceui-bootstrap" type="application/json">{{.Bootstrap}}</script><script type="module" src="/{{.JS}}"></script></body></html>`))

func loadSite() (*site, error) {
	files, err := fs.Sub(embeddedWeb, "web")
	if err != nil {
		return nil, fmt.Errorf("traceui: open embedded site: %w", err)
	}
	raw, err := fs.ReadFile(files, "manifest.json")
	if err != nil {
		return nil, fmt.Errorf("traceui: read asset manifest: %w", err)
	}
	var assets manifest
	if err := json.Unmarshal(raw, &assets); err != nil || assets.JS == "" || assets.CSS == "" {
		return nil, fmt.Errorf("traceui: invalid asset manifest")
	}
	return &site{files: files, manifest: assets}, nil
}

func (site *site) render(snap snapshot) ([]byte, error) {
	payload, err := json.Marshal(listResponse{Sessions: snap.rows, Totals: computeTotals(snap.rows)})
	if err != nil {
		return nil, err
	}
	var page bytes.Buffer
	err = shell.Execute(&page, shellData{CSS: site.manifest.CSS, JS: site.manifest.JS, Bootstrap: template.JS(payload), Rows: snap.rows}) //nolint:gosec // encoding/json escapes script delimiters
	return page.Bytes(), err
}
