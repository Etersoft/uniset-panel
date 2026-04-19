// Package trace polls uniset /dump?trace=1 per (server, object) and
// pushes batches over the SSE hub. Record schema is defined by Spec 1
// (uniset side) and kept as opaque json.RawMessage here.
package trace

import "encoding/json"

// dumpEnvelope mirrors uniset's /dump?trace=1 response (top level
// {"<ObjectName>": {"trace": {...}}}).
// The outer object-key unwrap is done by client.go.
type dumpEnvelope struct {
	Trace *traceSection `json:"trace"`
}

type traceSection struct {
	Enabled  bool              `json:"enabled"`
	Overflow bool              `json:"overflow"`
	Records  []json.RawMessage `json:"records"`
}

// TraceBatch is what the SSE hub broadcasts to browsers. Records are
// raw JSON passed through verbatim.
type TraceBatch struct {
	Enabled  bool              `json:"enabled"`
	Overflow bool              `json:"overflow"`
	Records  []json.RawMessage `json:"records"`
}

// recordTimeOnly parses just time_us from a record for watermark updates.
type recordTimeOnly struct {
	TimeUs int64 `json:"time_us"`
}
