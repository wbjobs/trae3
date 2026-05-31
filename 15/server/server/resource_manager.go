package server

import (
	"sync"
)

type ResourceEntry struct {
	ID          string                 `json:"id"`
	Category    string                 `json:"category"`
	Name        string                 `json:"name"`
	Path        string                 `json:"path"`
	Type        string                 `json:"type"`
	Metadata    map[string]interface{} `json:"metadata"`
}

type ResourceManager struct {
	resources map[string][]*ResourceEntry
	mu        sync.RWMutex
}

func NewResourceManager() *ResourceManager {
	rm := &ResourceManager{
		resources: make(map[string][]*ResourceEntry),
	}
	rm.initDefaultResources()
	return rm
}

func (rm *ResourceManager) initDefaultResources() {
	rm.resources["platform"] = []*ResourceEntry{
		{ID: "platform_standard", Category: "platform", Name: "Standard Platform", Path: "res://assets/platforms/standard.tscn", Type: "scene", Metadata: map[string]interface{}{"size": 10.0}},
		{ID: "platform_large", Category: "platform", Name: "Large Platform", Path: "res://assets/platforms/large.tscn", Type: "scene", Metadata: map[string]interface{}{"size": 20.0}},
		{ID: "platform_mobile", Category: "platform", Name: "Mobile Platform", Path: "res://assets/platforms/mobile.tscn", Type: "scene", Metadata: map[string]interface{}{"size": 8.0, "can_move": true}},
	}

	rm.resources["environment"] = []*ResourceEntry{
		{ID: "env_skybox_day", Category: "environment", Name: "Day Skybox", Path: "res://assets/environment/sky_day.tres", Type: "resource", Metadata: map[string]interface{}{}},
		{ID: "env_skybox_night", Category: "environment", Name: "Night Skybox", Path: "res://assets/environment/sky_night.tres", Type: "resource", Metadata: map[string]interface{}{}},
		{ID: "env_fog_effect", Category: "environment", Name: "Fog Effect", Path: "res://assets/environment/fog.tscn", Type: "scene", Metadata: map[string]interface{}{"density": 0.5}},
		{ID: "env_aurora", Category: "environment", Name: "Aurora Effect", Path: "res://assets/environment/aurora.tscn", Type: "scene", Metadata: map[string]interface{}{"intensity": 0.8}},
	}

	rm.resources["player"] = []*ResourceEntry{
		{ID: "player_model_default", Category: "player", Name: "Default Character", Path: "res://assets/players/default.tscn", Type: "scene", Metadata: map[string]interface{}{}},
		{ID: "player_jetpack", Category: "player", Name: "Jetpack Attachment", Path: "res://assets/players/jetpack.tscn", Type: "scene", Metadata: map[string]interface{}{"energy_cost": 2.0}},
	}

	rm.resources["effect"] = []*ResourceEntry{
		{ID: "effect_lightning", Category: "effect", Name: "Lightning Bolt", Path: "res://assets/effects/lightning.tscn", Type: "scene", Metadata: map[string]interface{}{"damage": 10.0}},
		{ID: "effect_wind_particle", Category: "effect", Name: "Wind Particles", Path: "res://assets/effects/wind_particles.tscn", Type: "scene", Metadata: map[string]interface{}{}},
	}
}

func (rm *ResourceManager) GetByCategory(category string) []*ResourceEntry {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	if category == "" || category == "all" {
		var all []*ResourceEntry
		for _, entries := range rm.resources {
			all = append(all, entries...)
		}
		return all
	}

	entries, ok := rm.resources[category]
	if !ok {
		return []*ResourceEntry{}
	}

	result := make([]*ResourceEntry, len(entries))
	copy(result, entries)
	return result
}

func (rm *ResourceManager) AddResource(entry *ResourceEntry) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	rm.resources[entry.Category] = append(rm.resources[entry.Category], entry)
}
