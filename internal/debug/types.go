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
// Package debug provides a Snapshot adapter over uniset
// /<ObjectName>/dump. Spec 4: no history method (deferred to Spec 5).
package debug

import "errors"

// Port is one input or output (from uniset io.in[*] / io.out[*]).
type Port struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Value any    `json:"value"`
}

// Timer mirrors uniset Timers[<id>].
type Timer struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	IntervalMS int64  `json:"interval_ms"`
	TimeLeft   int64  `json:"time_left"`
	Tick       int64  `json:"tick"`
}

// Snapshot is the flat envelope returned to frontend.
type Snapshot struct {
	Object     string         `json:"object"`
	Server     string         `json:"server"`
	Inputs     []Port         `json:"inputs"`
	Outputs    []Port         `json:"outputs"`
	Variables  map[string]any `json:"variables"`
	Timers     []Timer        `json:"timers"`
	Statistics map[string]any `json:"statistics"`
	SMObject   string         `json:"sm_object"`
}

var (
	ErrObjectNotFound = errors.New("debug: object not found")
	ErrUpstream       = errors.New("debug: upstream protocol error")
)
