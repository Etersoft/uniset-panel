/*
 * Copyright (c) 2025 Pavel Vainerman.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation, version 2.1.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Lesser Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
// --------------------------------------------------------------------------
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
