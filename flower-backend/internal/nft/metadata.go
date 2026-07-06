package nft

import (
	"encoding/json"
	"fmt"
)

type Attribute struct {
	TraitType string      `json:"trait_type"`
	Value     interface{} `json:"value"`
}

type Metadata struct {
	Name        string      `json:"name"`
	Description string      `json:"description,omitempty"`
	Image       string      `json:"image,omitempty"`
	Attributes  []Attribute `json:"attributes,omitempty"`
}

func BuildMetadata(personName, flowerID string, seed uint64, algoVersion, imageURL string, attrs []Attribute) ([]byte, error) {
	m := Metadata{
		Name:        fmt.Sprintf("Flower for %s", personName),
		Description: "A personalized procedural 3D flower.",
		Image:       imageURL,
		Attributes: append([]Attribute{
			{TraitType: "flower_id", Value: flowerID},
			{TraitType: "seed", Value: seed},
			{TraitType: "algo_version", Value: algoVersion},
		}, attrs...),
	}
	return json.Marshal(m)
}