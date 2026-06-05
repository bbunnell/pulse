export type Role = "employee" | "manager" | "admin";
export type ProfileStatus = "active" | "inactive";
export type SegmentType = "break" | "lunch";
export type TimeOffType = "vacation" | "sick";
export type TimeOffStatus = "submitted" | "approved" | "rejected" | "cancelled";
export type AttendanceStatus =
  | "available"
  | "on_break"
  | "at_lunch"
  | "not_punched_in"
  | "punched_out"
  | "out_sick"
  | "on_vacation";

export type ReminderType =
  | "punch_in"
  | "punch_out"
  | "missing_punch"
  | "outlook_oof"
  | "account_creation"
  | "time_off_confirmation"
  | "ics_delivery";

export interface Team {
  id: string;
  name: string;
  managerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  authUserId?: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  teamId: string;
  status: ProfileStatus;
  expectedStartTime: string;
  timezone: string;          // IANA tz, e.g. "Asia/Manila"
  showOnDashboard: boolean;  // false for placeholders that never clock in
  workScheduleType: "standard" | "shift_based";
  standardWorkDays: number[];  // 0=Sun … 6=Sat, in employee's own timezone
  hideWhenNotActive: boolean;  // only show on board when clocked in or on PTO
  birthday?: string;         // "MM-DD" — month and day only, no year
  workAnniversary?: string;  // "YYYY-MM-DD" — hire / start date
  createdAt: string;
  updatedAt: string;
}

export interface Shift {
  id: string;
  userId: string;
  punchInAt: string;
  punchOutAt?: string;
  status: "open" | "closed";
  notes?: string;
  editedBy?: string;
  editedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftSegment {
  id: string;
  shiftId: string;
  userId: string;
  segmentType: SegmentType;
  startAt: string;
  endAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeOffEntry {
  id: string;
  userId: string;
  timeOffType: TimeOffType;
  startAt: string;
  endAt: string;
  fullDay: boolean;
  hours: number;
  status: TimeOffStatus;
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderRule {
  id: string;
  reminderType: ReminderType;
  enabled: boolean;
  sendTime: string;
  timezone: string;
  teamId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailLog {
  id: string;
  userId?: string;
  emailType: ReminderType;
  recipientEmail: string;
  subject: string;
  status: "queued" | "sent" | "failed";
  providerMessageId?: string;
  sentAt?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface IcsEventRecord {
  id: string;
  timeOffEntryId: string;
  userId: string;
  uid: string;
  method: "REQUEST" | "CANCEL";
  sequence: number;
  fileName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorUserId?: string;
  targetUserId?: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  createdAt: string;
}

export interface ScheduledShift {
  id: string;
  profileId: string;
  shiftDate: string;    // "2026-06-03"  (date-only, local timezone)
  startTime: string;    // "09:00"       (24h time string)
  endTime: string;      // "17:00"       — if ≤ startTime the shift crosses midnight
  label?: string;       // "Overnight" | "Day" | "Evening" | etc.
  notes?: string;
  ruleId?: string;      // populated when generated from a ScheduleRule
  isOpen: boolean;      // true = this shift needs coverage
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRule {
  id: string;
  profileId: string;
  startTime: string;       // "21:00"
  endTime: string;         // "06:00"
  label?: string;
  notes?: string;
  daysOfWeek: number[];    // [0,1,2,3,4] — 0=Sun … 6=Sat
  repeatWeeks: 1 | 2 | 4;
  effectiveFrom: string;   // ISO date
  effectiveUntil?: string; // ISO date | undefined = open-ended
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateShift {
  profileId: string;
  dayOfWeek: number;   // 0-6
  startTime: string;
  endTime: string;
  label?: string;
  notes?: string;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  description?: string;
  shifts: TemplateShift[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrgData {
  profiles: Profile[];
  teams: Team[];
  shifts: Shift[];
  segments: ShiftSegment[];
  timeOff: TimeOffEntry[];
  reminderRules: ReminderRule[];
}

export interface AttendanceSnapshot {
  profile: Profile;
  team?: Team;
  status: AttendanceStatus;
  activeShift?: Shift;
  activeSegment?: ShiftSegment;
  todayShift?: Shift;
  todayBreakMinutes: number;
  todayLunchMinutes: number;
  missingPunch: boolean;
  timeOffToday?: TimeOffEntry;

  // ── Schedule integration (timezone-aware, per employee) ──
  /** The scheduled shift that covers the current instant, if any. */
  scheduledNow?: ScheduledShift;
  /** Whether the employee is scheduled to be working right now. */
  isScheduledNow: boolean;
  /** Minutes past scheduled start with no punch-in (0 if on time / not scheduled). */
  minutesLate: number;
  /** True if scheduled now but not clocked in (and grace period elapsed). */
  isLate: boolean;
  /** True if the employee has any scheduled shift on their local "today". */
  scheduledToday: boolean;
  /** Minutes the employee has been clocked in on the active shift (0 if not). */
  clockedInMinutes: number;
  /** True if the open shift is implausibly long (likely a forgotten punch-out). */
  likelyForgotPunchOut: boolean;
  /** Minutes past the scheduled end while still clocked in (overtime). */
  overtimeMinutes: number;
}

/** One hour of the day and whether anyone is scheduled to cover it. */
export interface CoverageHour {
  hour: number;          // 0–23 in the org reference timezone
  covered: boolean;
  scheduledCount: number;
  onlineCount: number;   // scheduled AND clocked in
}

export interface CoverageSummary {
  scheduledNow: AttendanceSnapshot[];
  onlineNow: AttendanceSnapshot[];   // scheduled now AND clocked in
  absentNow: AttendanceSnapshot[];   // scheduled now but NOT clocked in
  gapHours: number[];                // hours of today (org tz) with zero coverage
  understaffed: { hour: number; required: number; scheduled: number }[]; // below min-staff
}

export interface WeeklyReportRow {
  employeeId: string;
  employeeName: string;
  teamName: string;
  date: string;
  punchIn?: string;
  punchOut?: string;
  grossMinutes: number;
  breakMinutes: number;
  lunchMinutes: number;
  payableMinutes: number;
  vacationHours: number;
  sickHours: number;
  missingPunchWarnings: string[];
  editedWarnings: string[];
}

export interface WeeklyEmployeeTotal {
  employeeId: string;
  employeeName: string;
  teamName: string;
  payableMinutes: number;
  vacationHours: number;
  sickHours: number;
  warnings: number;
}
