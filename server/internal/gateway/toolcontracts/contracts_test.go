package toolcontracts

import "testing"

func TestHostedReadContracts(t *testing.T) {
	for _, name := range []string{"list_projects", "list_scenes", "read_scene"} {
		contract, err := Get(name)
		if err != nil {
			t.Fatal(err)
		}
		if contract.Mutation != "read" || !contains(contract.Surfaces, "desktop") || !contains(contract.Surfaces, "hosted") {
			t.Fatalf("contract %s has mutation=%q surfaces=%v", name, contract.Mutation, contract.Surfaces)
		}
	}
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
