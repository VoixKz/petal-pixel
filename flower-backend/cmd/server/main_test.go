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
