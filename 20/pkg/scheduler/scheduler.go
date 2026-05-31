package scheduler

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/robfig/cron/v3"
)

type Task struct {
	ID       cron.EntryID
	Name     string
	CronExpr string
	Job      func()
	NextRun  time.Time
	Enabled  bool
}

type Scheduler struct {
	cron    *cron.Cron
	tasks   map[string]*Task
	logger  *log.Logger
	running bool
}

type TaskFunc func() error

type ScheduledTask struct {
	Name        string
	Description string
	CronExpr    string
	Func        TaskFunc
	OnSuccess   func(string)
	OnError     func(string, error)
}

func NewScheduler() *Scheduler {
	c := cron.New(
		cron.WithParser(cron.NewParser(
			cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow,
		)),
	)

	return &Scheduler{
		cron:   c,
		tasks:  make(map[string]*Task),
		logger: log.New(os.Stdout, "[SCHEDULER] ", log.LstdFlags),
	}
}

func (s *Scheduler) AddTask(st ScheduledTask) error {
	if _, exists := s.tasks[st.Name]; exists {
		return fmt.Errorf("task with name %s already exists", st.Name)
	}

	cronExpr := normalizeCronExpr(st.CronExpr)
	s.logger.Printf("解析Cron表达式: 原始=%q, 标准化=%q", st.CronExpr, cronExpr)

	wrappedJob := func() {
		s.logger.Printf("Starting task: %s", st.Name)
		startTime := time.Now()

		err := st.Func()
		duration := time.Since(startTime)

		if err != nil {
			s.logger.Printf("Task %s failed after %v: %v", st.Name, duration, err)
			if st.OnError != nil {
				st.OnError(st.Name, err)
			}
		} else {
			s.logger.Printf("Task %s completed successfully in %v", st.Name, duration)
			if st.OnSuccess != nil {
				st.OnSuccess(st.Name)
			}
		}
	}

	entryID, err := s.cron.AddFunc(cronExpr, wrappedJob)
	if err != nil {
		return fmt.Errorf("failed to schedule task %s: %w", st.Name, err)
	}

	entry := s.cron.Entry(entryID)
	s.tasks[st.Name] = &Task{
		ID:       entryID,
		Name:     st.Name,
		CronExpr: cronExpr,
		Job:      wrappedJob,
		NextRun:  entry.Next,
		Enabled:  true,
	}

	s.logger.Printf("Task %s scheduled, next run: %s",
		st.Name, entry.Next.Format(time.RFC3339))

	return nil
}

func (s *Scheduler) RemoveTask(name string) error {
	task, exists := s.tasks[name]
	if !exists {
		return fmt.Errorf("task %s not found", name)
	}

	s.cron.Remove(task.ID)
	delete(s.tasks, name)
	s.logger.Printf("Task %s removed", name)
	return nil
}

func (s *Scheduler) Start() {
	s.running = true
	s.cron.Start()
	s.logger.Println("Scheduler started")
}

func (s *Scheduler) Stop() {
	if s.running {
		ctx := s.cron.Stop()
		<-ctx.Done()
		s.running = false
		s.logger.Println("Scheduler stopped")
	}
}

func (s *Scheduler) GetTasks() []*Task {
	tasks := make([]*Task, 0, len(s.tasks))
	for _, t := range s.tasks {
		entry := s.cron.Entry(t.ID)
		t.NextRun = entry.Next
		tasks = append(tasks, t)
	}
	return tasks
}

func (s *Scheduler) GetTask(name string) (*Task, bool) {
	task, exists := s.tasks[name]
	if exists {
		entry := s.cron.Entry(task.ID)
		task.NextRun = entry.Next
	}
	return task, exists
}

func (s *Scheduler) RunTaskNow(name string) error {
	task, exists := s.tasks[name]
	if !exists {
		return fmt.Errorf("task %s not found", name)
	}

	go task.Job()
	return nil
}

func (s *Scheduler) WaitForInterrupt() {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan
	s.logger.Println("Received interrupt signal")
	s.Stop()
}

func (s *Scheduler) ListTasks() string {
	var result string
	result += "Scheduled Tasks:\n"
	result += "----------------\n"
	for _, t := range s.tasks {
		entry := s.cron.Entry(t.ID)
		result += fmt.Sprintf("  %-20s %-20s Next: %s\n",
			t.Name, t.CronExpr, entry.Next.Format(time.RFC3339))
	}
	return result
}

func normalizeCronExpr(expr string) string {
	expr = strings.TrimSpace(expr)
	fields := strings.Fields(expr)

	if len(fields) == 5 {
		return expr
	}
	if len(fields) == 6 {
		return strings.Join(fields[1:], " ")
	}
	return expr
}

type InspectionScheduler struct {
	*Scheduler
	config *SchedulerConfig
}

type SchedulerConfig struct {
	Enabled    bool
	CronExpr string
	OutputDir string
	Formats   []string
	Notify    NotifyConfig
}

type NotifyConfig struct {
	Email   EmailConfig
	Webhook string
}

type EmailConfig struct {
	Enabled  bool
	SMTPHost string
	SMTPPort int
	Username  string
	Password  string
	To        []string
}

func NewInspectionScheduler(config *SchedulerConfig) *InspectionScheduler {
	return &InspectionScheduler{
		Scheduler: NewScheduler(),
		config:    config,
	}
}
