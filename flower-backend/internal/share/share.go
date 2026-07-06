// Package share renders the public share surface for a flower: the Open Graph /
// Twitter HTML document scrapers fetch at /share/<id>, and the read-only JSON the
// SPA landing consumes at /api/flowers/<id>. Everything here is pure data → bytes
// (no DB, no S3, no net/http) so it stays unit-testable in isolation.
package share

import (
	"bytes"
	"encoding/json"
	"html/template"
)

// FallbackImagePath is the branded OG image used when no per-flower PNG exists
// yet. It is a single raster asset (public/og-cover.png, 1200x630) served from
// FRONTEND_URL. The caller prefixes FRONTEND_URL to build the absolute og:image.
const FallbackImagePath = "/og-cover.png"

// HTMLData is the fully-resolved, escape-ready input for the share page. All
// fields are plain data so this stays unit-testable with no DB/S3.
type HTMLData struct {
	FlowerID    string
	PersonName  string
	ImageURL    string // resolved OG image (already fallback-substituted by caller if needed)
	ImageExists bool   // caller sets from S3 Exists(); false → ImageURL is the branded fallback
	ShareURL    string // canonical og:url (this backend /share/<id>)
	AppURL      string // SPA landing the human is forwarded to
}

var shareTmpl = template.Must(template.New("share").Parse(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Flower for {{.PersonName}}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="Flower for {{.PersonName}}">
<meta property="og:description" content="A generative flower grown from the name {{.PersonName}} on Petal Pixel.">
<meta property="og:image" content="{{.ImageURL}}">
<meta property="og:url" content="{{.ShareURL}}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Flower for {{.PersonName}}">
<meta name="twitter:description" content="A generative flower grown from the name {{.PersonName}} on Petal Pixel.">
<meta name="twitter:image" content="{{.ImageURL}}">
<meta http-equiv="refresh" content="0; url={{.AppURL}}">
</head>
<body>
<p>Redirecting to <a href="{{.AppURL}}">Petal Pixel</a>&hellip;</p>
</body>
</html>
`))

// RenderShareHTML returns the minimal OG/Twitter share document. html/template
// escapes every {{.}} interpolation, neutralising attribute injection from
// arbitrary person names. The fixed template is valid, so Execute cannot fail on
// these plain-string fields.
func RenderShareHTML(d HTMLData) string {
	var b bytes.Buffer
	_ = shareTmpl.Execute(&b, d)
	return b.String()
}

// FlowerData is the store row reduced to what the public (no-auth) endpoint
// exposes.
type FlowerData struct {
	FlowerID   string
	PersonName string
	ParamsJSON json.RawMessage // the flowers.params jsonb, verbatim
}

// PublicFlowerJSON produces the read-only body the SPA landing renders without
// login. ParamsJSON is embedded verbatim (as raw jsonb) so it is not
// double-encoded into a quoted string.
func PublicFlowerJSON(d FlowerData) ([]byte, error) {
	params := d.ParamsJSON
	if len(params) == 0 {
		params = json.RawMessage("null")
	}
	return json.Marshal(struct {
		FlowerID   string          `json:"flower_id"`
		PersonName string          `json:"person_name"`
		Params     json.RawMessage `json:"params"`
	}{d.FlowerID, d.PersonName, params})
}
