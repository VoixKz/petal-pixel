package main

import "testing"

func TestIsValidFlowerID(t *testing.T) {
	cases := []struct {
		name string
		id   string
		want bool
	}{
		{"valid canonical", "flw_0123456789abcdef", true},
		{"valid all hex letters", "flw_abcdefabcdefabcd", true},
		{"valid all digits", "flw_0000000000000000", true},
		{"empty", "", false},
		{"wrong prefix", "xxx_0123456789abcdef", false},
		{"no prefix", "0123456789abcdef", false},
		{"too short", "flw_0123456789abcde", false},
		{"too long", "flw_0123456789abcdef0", false},
		{"uppercase hex", "flw_0123456789ABCDEF", false},
		{"non-hex char", "flw_0123456789abcdeg", false},
		{"dot dot traversal", "flw_..", false},
		{"embedded traversal", "flw_0123456789ab/../", false},
		{"embedded slash", "images/flw_0123456789abcdef", false},
		{"trailing slash", "flw_0123456789abcdef/", false},
		{"percent junk", "flw_%2e%2e%2fabcdef", false},
		{"leading space", " flw_0123456789abcdef", false},
		{"trailing newline", "flw_0123456789abcdef\n", false},
		{"prefix only", "flw_", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isValidFlowerID(tc.id); got != tc.want {
				t.Errorf("isValidFlowerID(%q) = %v, want %v", tc.id, got, tc.want)
			}
		})
	}
}

func TestIsPNG(t *testing.T) {
	validPrefix := []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}
	cases := []struct {
		name string
		b    []byte
		want bool
	}{
		{"exact 8-byte magic", validPrefix, true},
		{"magic plus payload", append(append([]byte{}, validPrefix...), []byte("IHDR....")...), true},
		{"nil", nil, false},
		{"empty", []byte{}, false},
		{"too short", validPrefix[:7], false},
		{"jpeg magic", []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46}, false},
		{"arbitrary text", []byte("not a png at all, just bytes"), false},
		{"missing trailing lf", []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x00}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isPNG(tc.b); got != tc.want {
				t.Errorf("isPNG(%v) = %v, want %v", tc.b, got, tc.want)
			}
		})
	}
}
