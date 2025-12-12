package sensorconfig

// MurmurHash2 implements the MurmurHash2 algorithm.
// This implementation matches uniset's hash32() function which uses seed=0.
// Based on Austin Appleby's public domain implementation.
func MurmurHash2(data []byte, seed uint32) uint32 {
	const (
		m = uint32(0x5bd1e995)
		r = 24
	)

	length := len(data)
	h := seed ^ uint32(length)

	// Process 4 bytes at a time
	for len(data) >= 4 {
		k := uint32(data[0]) | uint32(data[1])<<8 | uint32(data[2])<<16 | uint32(data[3])<<24

		k *= m
		k ^= k >> r
		k *= m

		h *= m
		h ^= k

		data = data[4:]
	}

	// Handle the last few bytes
	switch len(data) {
	case 3:
		h ^= uint32(data[2]) << 16
		fallthrough
	case 2:
		h ^= uint32(data[1]) << 8
		fallthrough
	case 1:
		h ^= uint32(data[0])
		h *= m
	}

	// Final mixing
	h ^= h >> 13
	h *= m
	h ^= h >> 15

	return h
}

// Hash32 computes MurmurHash2 of a string with seed=0 (matches uniset::hash32)
func Hash32(s string) uint32 {
	return MurmurHash2([]byte(s), 0)
}
