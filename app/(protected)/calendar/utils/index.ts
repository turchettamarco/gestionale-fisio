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
  AppointmentParticipant,
} from "./types";

// Costanti, tema, helper status/treatment
export {
  THEME,
  DEFAULT_CLINIC_SITE,
  GOOGLE_REVIEW_LINK_FALLBACK,
  CLINIC_ADDRESSES,
  ALL_TREATMENTS,
  setTreatmentCatalog,
  statusColor,
  statusBg,
  statusLabel,
  cycleNextStatus,
  cycleDotTitle,
  cycleDotGlyph,
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
  getPatientAreaLink,
  getGreeting,
  defaultTemplateConferma,
  defaultTemplatePromemoria,
  DEFAULT_TEMPLATE_CONFERMA,
  DEFAULT_TEMPLATE_PROMEMORIA,
} from "./reminderMessage";

// Lane assignment per visualizzazione overlap appuntamenti (Google-style)
export { assignLanes, assignLanesByOperator } from "./laneAssignment";
export type { LanePosition } from "./laneAssignment";

// Helper multi-sede (mig. 014, fase 3)
export {
  locationInitials,
  resolveAppointmentLocation,
  getLocationCardStyle,
} from "./locationHelpers";
export type { StudioLocationLite } from "./locationHelpers";
