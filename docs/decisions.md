# Product Decisions

Recommended defaults for version one:

1. Vacation is auto-approved but stored with an approval-capable status model.
2. Sick time is notification-only and tracked separately from vacation.
3. Employees can see team-level availability and time off status on the dashboard.
4. Lunch is manually tracked, not automatically deducted.
5. Standard work week starts Monday.
6. Default timezone is `America/Chicago`.
7. Managers can review entries; admin corrections are tracked with edited fields and audit logs.
8. Employee punch correction requests should be added after the first payroll review cycle.
9. Choose one transactional email provider before production. Resend is the simplest initial option.
10. Gusto starts as CSV export. Match the final CSV columns to the payroll entry workflow after a sample payroll run.
