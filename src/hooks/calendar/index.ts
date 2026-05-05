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
