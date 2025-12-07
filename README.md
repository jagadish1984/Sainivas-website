# Sainivas website

A lightweight browser-based demo for tracking apartment maintenance billing and collections. The app runs entirely in the browser and stores data locally (no backend required).

## Features
- Dashboard overview of total flats, collections, pending, overdue dues, and outstanding amounts
- Resident roster with search, status filter, and quick actions (collect, mark pending)
- Forms to record maintenance payments and add/update flats
- Export current snapshot as JSON and restore demo data with one click plus inline action feedback
- Mobile-friendly responsive layout

## Running locally
1. Serve the files with any static web server (for example):
   ```bash
   python -m http.server 8000
   ```
2. Open `http://localhost:8000` in your browser.

All data is stored in `localStorage`, so refreshing the page preserves your updates. Use **Reset demo data** to start over.

## Testing
- Follow the smoke-test checklist in [`TESTING.md`](TESTING.md) to validate the main flows.
- Resize your browser or use device emulation to confirm the responsive layout behaves on mobile widths.
