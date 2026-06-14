package events

import (
	"sync"
	"testing"
)

// TestWriterForConcurrent exercises the lazy writer cache from many goroutines
// at once. Before the cache was mutex-guarded this raced the underlying map and
// `go test -race` would report a data race (or a fatal concurrent map panic).
// It establishes no network connection — writerFor only constructs writers.
func TestWriterForConcurrent(t *testing.T) {
	p := NewKafkaPublisher([]string{"localhost:9092"})
	defer p.Close()

	topics := []string{"project.created", "project.deleted", "billing.updated", "collab.added"}

	var wg sync.WaitGroup
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			p.writerFor(topics[i%len(topics)])
		}(i)
	}
	wg.Wait()

	if got := len(p.writers); got != len(topics) {
		t.Fatalf("expected one writer per distinct topic (%d), got %d", len(topics), got)
	}
}

// TestWriterForSameTopicReused verifies the double-checked init returns a single
// shared writer per topic rather than one per call.
func TestWriterForSameTopicReused(t *testing.T) {
	p := NewKafkaPublisher([]string{"localhost:9092"})
	defer p.Close()

	a := p.writerFor("project.created")
	b := p.writerFor("project.created")
	if a != b {
		t.Fatal("writerFor returned distinct writers for the same topic")
	}
}
