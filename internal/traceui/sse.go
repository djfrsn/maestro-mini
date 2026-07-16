package traceui

import "sync"

// subscriberBuffer is the per-subscriber channel depth. A subscriber that
// falls this many change events behind is dropped rather than allowed to
// stall the poller.
const subscriberBuffer = 8

// broadcaster fans one change-event stream out to every connected SSE
// subscriber. Sends never block: a subscriber whose buffer is full is
// removed and its channel closed, which its handler observes as end of
// stream. Only broadcast closes channels, and only while the channel is
// still registered, so a concurrent unsubscribe can never double-close.
type broadcaster struct {
	mu   sync.Mutex
	subs map[chan string]struct{}
}

func newBroadcaster() *broadcaster {
	return &broadcaster{subs: make(map[chan string]struct{})}
}

// subscribe registers one subscriber and returns its event channel.
func (b *broadcaster) subscribe() chan string {
	ch := make(chan string, subscriberBuffer)
	b.mu.Lock()
	b.subs[ch] = struct{}{}
	b.mu.Unlock()
	return ch
}

// unsubscribe removes one subscriber. The channel is left open; the handler
// that owns it simply stops reading. A subscriber already dropped by
// broadcast is a no-op.
func (b *broadcaster) unsubscribe(ch chan string) {
	b.mu.Lock()
	delete(b.subs, ch)
	b.mu.Unlock()
}

// broadcast delivers one pre-rendered SSE frame to every subscriber.
// Subscribers with full buffers are dropped and closed.
func (b *broadcaster) broadcast(frame string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for ch := range b.subs {
		select {
		case ch <- frame:
		default:
			delete(b.subs, ch)
			close(ch)
		}
	}
}
