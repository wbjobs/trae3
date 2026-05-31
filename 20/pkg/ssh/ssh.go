package ssh

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"runtime"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

type Gateway struct {
	Host       string
	Port       int
	Username   string
	Password   string
	PrivateKey string
	Name       string
	Group      string
	Timeout    time.Duration
	MaxRetries int
}

type SSHClient struct {
	Gateway     Gateway
	Client      *ssh.Client
	ConnTime    time.Time
	LastErr     error
	mu          sync.Mutex
	commandTimeout time.Duration
}

type ClusterManager struct {
	Gateways     []Gateway
	Clients      map[string]*SSHClient
	FailedGateways map[string]error
	mu           sync.Mutex
	Concurrency  int
}

func NewClusterManager(gateways []Gateway) *ClusterManager {
	cm := &ClusterManager{
		Gateways:        gateways,
		Clients:         make(map[string]*SSHClient),
		FailedGateways:  make(map[string]error),
		Concurrency:     5,
	}
	for i := range cm.Gateways {
		if cm.Gateways[i].MaxRetries <= 0 {
			cm.Gateways[i].MaxRetries = 2
		}
	}
	return cm
}

func (cm *ClusterManager) SetConcurrency(n int) {
	if n > 0 {
		cm.Concurrency = n
	}
}

func (cm *ClusterManager) ConnectAll() error {
	var wg sync.WaitGroup
	sem := make(chan struct{}, cm.Concurrency)
	var errs []error
	var mu sync.Mutex

	for _, gw := range cm.Gateways {
		wg.Add(1)
		go func(gw Gateway) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			client, err := NewSSHClientWithRetry(gw)
			cm.mu.Lock()
			defer cm.mu.Unlock()
			if err != nil {
				fmt.Printf("✗ 连接 %s 失败: %v\n", gw.Name, err)
				cm.FailedGateways[gw.Name] = err
				mu.Lock()
				errs = append(errs, fmt.Errorf("%s: %w", gw.Name, err))
				mu.Unlock()
			} else {
				fmt.Printf("✓ 已连接 %s (%s)\n", gw.Name, gw.Host)
				cm.Clients[gw.Name] = client
			}
		}(gw)
	}
	wg.Wait()

	if len(errs) > 0 {
		return fmt.Errorf("%d 台网关连接失败: %w", len(errs), errors.Join(errs...))
	}
	return nil
}

func (cm *ClusterManager) DisconnectAll() {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	for name, client := range cm.Clients {
		if client.Client != nil {
			client.Client.Close()
			fmt.Printf("已断开 %s\n", name)
		}
	}
}

func (cm *ClusterManager) GetClient(name string) (*SSHClient, bool) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	client, ok := cm.Clients[name]
	return client, ok
}

func (cm *ClusterManager) ExecuteOnAll(cmd string) map[string]string {
	results := make(map[string]string)
	var mu sync.Mutex
	var wg sync.WaitGroup

	cm.mu.Lock()
	clientCount := len(cm.Clients)
	if clientCount == 0 {
		cm.mu.Unlock()
		return results
	}

	sem := make(chan struct{}, cm.Concurrency)
	for name, client := range cm.Clients {
		wg.Add(1)
		go func(name string, client *SSHClient) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			output, err := client.Execute(cmd)

			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				results[name] = fmt.Sprintf("ERROR: %v", err)
			} else {
				results[name] = output
			}
		}(name, client)
	}
	cm.mu.Unlock()
	wg.Wait()

	return results
}

func NewSSHClientWithRetry(gw Gateway) (*SSHClient, error) {
	var lastErr error
	for attempt := 0; attempt <= gw.MaxRetries; attempt++ {
		client, err := NewSSHClient(gw)
		if err == nil {
			return client, nil
		}
		lastErr = err
		if attempt < gw.MaxRetries {
			sleep := time.Duration(attempt+1) * 2 * time.Second
			fmt.Printf("  连接 %s 失败，%v 后重试(%d/%d)...\n", gw.Name, sleep, attempt+1, gw.MaxRetries)
			time.Sleep(sleep)
		}
	}
	return nil, fmt.Errorf("连接失败，已重试 %d 次: %w", gw.MaxRetries, lastErr)
}

func NewSSHClient(gw Gateway) (*SSHClient, error) {
	var authMethods []ssh.AuthMethod

	if gw.Password != "" {
		authMethods = append(authMethods, ssh.Password(gw.Password))
	}

	if gw.PrivateKey != "" {
		expandedKey := expandPath(gw.PrivateKey)
		key, err := os.ReadFile(expandedKey)
		if err != nil {
			return nil, fmt.Errorf("读取私钥 %s 失败: %w", expandedKey, err)
		}
		signer, err := ssh.ParsePrivateKey(key)
		if err != nil {
			return nil, fmt.Errorf("解析私钥失败: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}

	if runtime.GOOS != "windows" {
		authSock := os.Getenv("SSH_AUTH_SOCK")
		if authSock != "" {
			if sshAgent, err := net.DialTimeout("unix", authSock, 2*time.Second); err == nil {
				agentClient := agent.NewClient(sshAgent)
				if signers, err := agentClient.Signers(); err == nil && len(signers) > 0 {
					authMethods = append(authMethods, ssh.PublicKeys(signers...))
				}
			}
		}
	}

	if len(authMethods) == 0 {
		return nil, fmt.Errorf("未提供任何认证方式 (需要密码或私钥)")
	}

	timeout := gw.Timeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	config := &ssh.ClientConfig{
		User:            gw.Username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         timeout,
	}

	addr := fmt.Sprintf("%s:%d", gw.Host, gw.Port)
	conn, err := net.DialTimeout("tcp", addr, timeout)
	if err != nil {
		return nil, fmt.Errorf("TCP连接失败: %w", err)
	}

	sshConn, chans, reqs, err := ssh.NewClientConn(conn, addr, config)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("SSH握手失败: %w", err)
	}

	return &SSHClient{
		Gateway:        gw,
		Client:         ssh.NewClient(sshConn, chans, reqs),
		ConnTime:       time.Now(),
		commandTimeout: 30 * time.Second,
	}, nil
}

func (sc *SSHClient) SetCommandTimeout(d time.Duration) {
	if d > 0 {
		sc.commandTimeout = d
	}
}

func (sc *SSHClient) Execute(cmd string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), sc.commandTimeout)
	defer cancel()
	return sc.ExecuteWithContext(ctx, cmd)
}

func (sc *SSHClient) ExecuteWithContext(ctx context.Context, cmd string) (string, error) {
	if sc.Client == nil {
		return "", fmt.Errorf("客户端未连接")
	}

	sc.mu.Lock()
	defer sc.mu.Unlock()

	session, err := sc.Client.NewSession()
	if err != nil {
		sc.LastErr = err
		return "", fmt.Errorf("创建会话失败: %w", err)
	}
	defer session.Close()

	var stdout, stderr bytes.Buffer
	session.Stdout = &stdout
	session.Stderr = &stderr

	done := make(chan error, 1)
	go func() {
		done <- session.Run(cmd)
	}()

	select {
	case <-ctx.Done():
		session.Signal(ssh.SIGKILL)
		return "", fmt.Errorf("命令执行超时: %w", ctx.Err())
	case err := <-done:
		if err != nil {
			sc.LastErr = err
			if stderr.Len() > 0 {
				return "", fmt.Errorf("命令执行失败: %w, stderr: %s", err, stderr.String())
			}
			return "", fmt.Errorf("命令执行失败: %w", err)
		}
	}

	return stdout.String(), nil
}

func (sc *SSHClient) ExecuteWithStdin(cmd string, stdin io.Reader) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), sc.commandTimeout)
	defer cancel()

	if sc.Client == nil {
		return "", fmt.Errorf("客户端未连接")
	}

	sc.mu.Lock()
	defer sc.mu.Unlock()

	session, err := sc.Client.NewSession()
	if err != nil {
		sc.LastErr = err
		return "", fmt.Errorf("创建会话失败: %w", err)
	}
	defer session.Close()

	session.Stdin = stdin
	var stdout, stderr bytes.Buffer
	session.Stdout = &stdout
	session.Stderr = &stderr

	done := make(chan error, 1)
	go func() {
		done <- session.Run(cmd)
	}()

	select {
	case <-ctx.Done():
		session.Signal(ssh.SIGKILL)
		return "", fmt.Errorf("命令执行超时: %w", ctx.Err())
	case err := <-done:
		if err != nil {
			sc.LastErr = err
			if stderr.Len() > 0 {
				return "", fmt.Errorf("命令执行失败: %w, stderr: %s", err, stderr.String())
			}
			return "", fmt.Errorf("命令执行失败: %w", err)
		}
	}

	return stdout.String(), nil
}

func (sc *SSHClient) Close() error {
	if sc.Client != nil {
		return sc.Client.Close()
	}
	return nil
}

func expandPath(path string) string {
	if len(path) > 1 && path[:2] == "~/" {
		home, err := os.UserHomeDir()
		if err == nil {
			return home + path[1:]
		}
	}
	return path
}
