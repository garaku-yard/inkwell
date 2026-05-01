package aiadapter

import (
	"bufio"
	"context"
	"errors"
	"io"
	"strings"
)

// sseEvent is the internal shape yielded by the SSE scanner. We only need
// `event` and `data` fields; `id` and `retry` never appear in the
// provider streams we target and are dropped.
type sseEvent struct {
	event string
	data  string
}

// sseScanner streams SSE events off an io.Reader. It allocates one
// re-usable buffer and scans line-by-line, emitting one event per blank
// line. Lines beginning with ':' are comments and ignored.
type sseScanner struct {
	r       *bufio.Reader
	event   string
	data    strings.Builder
	hasData bool
	closer  io.Closer
}

func newSSEScanner(body io.ReadCloser) *sseScanner {
	return &sseScanner{r: bufio.NewReaderSize(body, 4096), closer: body}
}

// Next reads up to the next blank-line-delimited event. Honors ctx
// cancellation cooperatively between line reads. Returns io.EOF on
// clean end-of-stream.
func (s *sseScanner) Next(ctx context.Context) (sseEvent, error) {
	for {
		if err := ctx.Err(); err != nil {
			return sseEvent{}, err
		}
		line, err := s.r.ReadString('\n')
		atEOF := errors.Is(err, io.EOF)
		if err != nil && !atEOF {
			return sseEvent{}, err
		}

		// ReadString returns any partial line alongside io.EOF. Process
		// it first — some providers truncate the final event without the
		// trailing blank line.
		line = strings.TrimRight(line, "\r\n")
		processed := false
		if line != "" {
			if strings.HasPrefix(line, ":") {
				// comment — skip
				processed = true
			} else {
				field, value := splitSSE(line)
				switch field {
				case "event":
					s.event = value
				case "data":
					if s.hasData {
						s.data.WriteByte('\n')
					}
					s.data.WriteString(value)
					s.hasData = true
				}
				processed = true
			}
		}

		if atEOF {
			if s.hasData || s.event != "" {
				return s.flush(), nil
			}
			return sseEvent{}, io.EOF
		}

		// Empty line = event terminator.
		if !processed {
			if s.hasData || s.event != "" {
				return s.flush(), nil
			}
		}
	}
}

func (s *sseScanner) flush() sseEvent {
	ev := sseEvent{event: s.event, data: s.data.String()}
	s.event = ""
	s.data.Reset()
	s.hasData = false
	return ev
}

// Close closes the underlying stream body.
func (s *sseScanner) Close() error {
	if s.closer == nil {
		return nil
	}
	return s.closer.Close()
}

// splitSSE splits a single SSE line into field/value. Missing colon means
// field-only (value = ""). A single leading space after the colon is
// stripped per the HTML spec.
func splitSSE(line string) (field, value string) {
	idx := strings.IndexByte(line, ':')
	if idx == -1 {
		return line, ""
	}
	field = line[:idx]
	value = line[idx+1:]
	value = strings.TrimPrefix(value, " ")
	return field, value
}
