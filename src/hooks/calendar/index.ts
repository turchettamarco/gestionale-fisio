// ═══════════════════════════════════════════════════════════════════════
// src/hooks/calendar/index.ts
// ═══════════════════════════════════════════════════════════════════════
// Cos'è:
//   Barrel di export per tutti gli hook custom della pagina /calendar.
//
// Dove si usa:
//   In app/(protected)/calendar/page.tsx come unico import per gli hook.
//
// Cosa fa:
//   Riespone i singoli hook da un punto centrale così la pagina importa
//   da "@/src/hooks/calendar" invece che da percorsi multipli.
// ═══════════════════════════════════════════════════════════════════════

export {
  useCalendarBootstrap,
  type TreatmentCatalogRow,
  type WorkingHourRow,
  type UseCalendarBootstrapOptions,
  type UseCalendarBootstrapReturn,
} from "./useCalendarBootstrap";

export {
  useSearchAndFilters,
  type CalendarFilters,
  type UseSearchAndFiltersOptions,
  type UseSearchAndFiltersReturn,
} from "./useSearchAndFilters";

export {
  useCalendarEvents,
  type UseCalendarEventsOptions,
  type UseCalendarEventsReturn,
} from "./useCalendarEvents";

export {
  useEventResize,
  type UseEventResizeOptions,
  type UseEventResizeReturn,
} from "./useEventResize";

export { validateEventMove } from "./moveValidation";

export {
  useRealtimeCalendar,
  type UseRealtimeCalendarOptions,
  type UseRealtimeCalendarReturn,
  type RealtimeStatus,
} from "./useRealtimeCalendar";

export {
  useReminderFlow,
  type WeeklyReminderTarget,
  type LastCreatedAppointment,
  type UseReminderFlowOptions,
  type UseReminderFlowReturn,
} from "./useReminderFlow";

export {
  useGroupOperations,
  type InitialParticipant,
  type UseGroupOperationsOptions,
  type UseGroupOperationsReturn,
} from "./useGroupOperations";

export {
  useDragAndDrop,
  type DraggingEvent,
  type DraggingOver,
  type HoverTooltipState,
  type UseDragAndDropOptions,
  type UseDragAndDropReturn,
} from "./useDragAndDrop";

export {
  useAppointmentMutations,
  type CreateFormState,
  type EditFormState,
  type QuickPatientFormState,
  type SelectedEventLite,
  type UseAppointmentMutationsOptions,
  type UseAppointmentMutationsReturn,
} from "./useAppointmentMutations";
