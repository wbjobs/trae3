package main

import (
	"time"

	"edge-gateway-inspector/pkg/config"
	sshpkg "edge-gateway-inspector/pkg/ssh"
)

func buildGatewayList(cfg *config.Config, targetName string, targetGroup string) []sshpkg.Gateway {
	var result []sshpkg.Gateway
	for _, gw := range cfg.Gateways {
		if !gw.Enabled {
			continue
		}
		if targetName != "" && gw.Name != targetName {
			continue
		}
		if targetGroup != "" && gw.Group != targetGroup {
			continue
		}
		timeout := gw.Timeout
		if timeout <= 0 {
			timeout = 10
		}
		result = append(result, sshpkg.Gateway{
			Name:       gw.Name,
			Group:      gw.Group,
			Host:       gw.Host,
			Port:       gw.Port,
			Username:   gw.Username,
			Password:   gw.Password,
			PrivateKey: gw.PrivateKey,
			Timeout:    time.Duration(timeout) * time.Second,
		})
	}
	return result
}
