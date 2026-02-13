# Pomodoro++

Pomodoro++ is a zero-dependency single-page productivity timer built with only HTML, CSS, and JavaScript.

## Run

Open `index.html` directly in a browser, or serve this folder as static files.

## Features

- Timer phases: focus, short break, long break
- Profile management with editable durations and cycle count
- Start, pause, reset, and skip controls
- Sound alerts using Web Audio API
- Browser notifications (with permission prompt)
- Settings dialog with auto-save
- Theme selector (auto/light/dark)
- High contrast accessibility mode
- Font selector (default Inter)
- Draggable mini floating timer mode
- Embeddable compact mode with `?embed=1`
- Lightweight task queue with task-attached sessions
- Weekly and monthly analytics (bar chart + heatmap)
- Local persistence via `localStorage`

## URL Parameters

- `?embed=1` compact widget mode
- `?profile=<id>` start with a specific profile id
- `?autostart=1` begin running immediately
- `?mini=1` start with mini timer visible
- `?theme=auto|light|dark`

## Keyboard Shortcuts

- `Space` start/pause
- `R` reset segment
- `S` skip segment
- `M` toggle mini timer
- `T` focus task input
- `?` open shortcuts dialog

## Notes

- Data is stored in `localStorage` under `pomodoro_plus_v1`.
- If notifications are denied, visual toasts continue to work.
