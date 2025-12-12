package sensorconfig

import "testing"

func TestHash32(t *testing.T) {
	tests := []struct {
		input    string
		expected uint32
	}{
		// Verified against uniset MurmurHash2 implementation
		{"DefaultObjectId", 1920521126},
		{"SES.AMC1_OPCUA_EM1", 1534986534},
		{"test", 403862830},
		{"", 0},
	}

	for _, tc := range tests {
		got := Hash32(tc.input)
		if got != tc.expected {
			t.Errorf("Hash32(%q) = %d, want %d", tc.input, got, tc.expected)
		}
	}
}

func TestMurmurHash2WithSeed(t *testing.T) {
	// Test that different seeds produce different results
	data := []byte("test")
	h1 := MurmurHash2(data, 0)
	h2 := MurmurHash2(data, 1)
	if h1 == h2 {
		t.Error("Different seeds should produce different hashes")
	}
}

func TestMurmurHash2Consistency(t *testing.T) {
	// Test that same input always produces same output
	input := "SES.AMC1_OPCUA_EM1"
	h1 := Hash32(input)
	h2 := Hash32(input)
	if h1 != h2 {
		t.Errorf("Hash32 is not consistent: %d != %d", h1, h2)
	}
}
