package main

import "testing"

func TestConfiguredListenAddressDefaultsToHostLocalAddress(t *testing.T) {
	t.Setenv("GAME_ENGINE_ADDR", "")

	if address := configuredListenAddress(); address != defaultListenAddress {
		t.Errorf("address = %q, want %q", address, defaultListenAddress)
	}
}

func TestConfiguredListenAddressUsesEnvironmentOverride(t *testing.T) {
	t.Setenv("GAME_ENGINE_ADDR", "0.0.0.0:8080")

	if address := configuredListenAddress(); address != "0.0.0.0:8080" {
		t.Errorf("address = %q, want 0.0.0.0:8080", address)
	}
}
