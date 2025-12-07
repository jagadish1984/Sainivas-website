# Testing the apartment billing demo

This project is a static, browser-only demo. Use the scenarios below to validate the core flows in any modern desktop or mobile browser.

## Start the app locally
1. From the repo root, serve the files with a static server:
   ```bash
   python -m http.server 8000
   ```
2. Open `http://localhost:8000` in your browser.

Data lives in `localStorage`, so refreshes keep your changes until you reset the demo data.

## Smoke test checklist
- **Dashboard counters:** Confirm the Overview cards show totals for flats, collected, pending, and overdue.
- **Roster load:** Verify the resident table is populated with demo entries on first load.
- **Search/filter:** Try searching by flat number/name and toggling the status filter; the table should update immediately.
- **Payment collection:** Use **Collect** on a pending row. The row's badge should switch to **Collected**, and the amount should add to the collected total.
- **Mark pending:** On a collected row, click **Pending** to revert the badge and totals.
- **Record payment form:** Submit the **Record Payment** form for an existing flat; the roster should update amounts and status.
- **Add/update flat:** Add a new flat with the **Manage Flats** form. Editing the same flat ID should update its record instead of creating a duplicate.
- **Export data:** Click **Export JSON** and verify a file downloads with the current roster state.
- **Reset demo data:** Press **Reset demo data** and ensure the roster and counters return to the seeded values.

## Mobile check
Resize the browser (or use device emulation) to confirm cards, tables, and forms stack responsively without horizontal scrolling.
