// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/utils/index.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Barrel di re-export per tutti gli utility del calendario.
// Permette di scrivere:
//
//   import { THEME, fmtTime, addDays } from "./utils";
//   import type { Status, CalendarEvent } from "./utils";
//
// invece di importare da 6 sottomoduli separati.
//
// Per modificare un singolo helper, edita il file specifico in utils/.
//
// ═══════════════════════════════════════════════════════════════════════

// Tipi
export type {
  Status,
  LocationType,
  TreatmentType,
  BookingRequest,
  AppointmentRow,
  PatientLite,
  PracticeSettings,
  CalendarEvent,
} from "./types";

// Costanti, tema, helper status/treatment
export {
  THEME,
  DEFAULT_CLINIC_SITE,
  GOOGLE_REVIEW_LINK_FALLBACK,
  CLINIC_ADDRESSES,
  ALL_TREATMENTS,
  statusColor,
  statusBg,
  statusLabel,
  getTreatmentColor,
  getTreatmentLabel,
  asTreatmentType,
  asPriceType,
} from "./constants";

// Utility date e orari
export {
  fmtTime,
  pad2,
  startOfISOWeekMonday,
  addDays,
  addWeeks,
  formatDMY,
  toDateInputValue,
  parseDateInput,
  autoNameFontSize,
  generateRecurringStarts,
  formatDateRelative,
  getMonthGridDays,
  getAvailableSlotsInDay,
  getEventYPosition,
} from "./dateHelpers";

// WhatsApp
export {
  normalizePhoneForWA,
  cleanPhoneForWA,
  openWhatsApp,
} from "./whatsapp";

// Export PDF settimanale
export { exportWeekToPDF } from "./exportPDF";

// Costruzione messaggio promemoria WA
export {
  buildReminderMessage,
  getGreeting,
  defaultTemplateConferma,
  defaultTemplatePromemoria,
  DEFAULT_TEMPLATE_CONFERMA,
  DEFAULT_TEMPLATE_PROMEMORIA,
} from "./reminderMessage";

// Lane assignment per visualizzazione overlap appuntamenti (Google-style)
export { assignLanes } from "./laneAssignment";
export type { LanePosition } from "./laneAssignment";
