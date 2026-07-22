// ═══════════════════════════════════════════════════════════════════════
// src/hooks/calendar/useCalendarEvents.ts
// ═══════════════════════════════════════════════════════════════════════
// Cos'è:
//   Hook che gestisce TUTTO ciò che riguarda gli appuntamenti come dati:
//   fetch, cache, filtraggio, statistiche, navigazione tra date/viste,
//   richieste di prenotazione web. Estratto da calendar/page.tsx
//   (refactor B3.3).
//
// Dove si usa:
//   In app/(protected)/calendar/page.tsx, dopo useCalendarBootstrap e
//   useSearchAndFilters.
//
// Cosa fa:
//   - State di base: events, loading, error, currentDate, viewType
//   - loadAppointments(start, end): query principale agli appointments
//     con tutti i join (patient, participants, location). Gestisce
//     race-condition con loadRequestId.
//   - Effetto auto-fetch quando cambia currentDate/viewType
//   - weeklyExpectedRevenue: calcolo del fatturato atteso del periodo
//     visualizzato (effetto separato che fa una query più snella)
//   - Navigazione date: previousWeek/nextWeek/today/gotoWeekStart
//     /previousMonth/nextMonth
//   - Memos: weekDays, monthDays, weekOptions
//   - Helpers occupazione: getAvailabilityForecast, getFreeWindows
//   - dailySummary: aggregato giornaliero per il modal "Riepilogo di oggi"
//   - Booking requests web: loadBookingRequests, confirmBooking,
//     rejectBooking, reopenBooking, + state UI (panel, loading, actionId)
//
// Dipendenze:
//   - clientReady (bootstrap): per attivare gli auto-fetch solo dopo
//     l'idratazione
//   - workingHours (bootstrap): per getFreeWindows
//   - currentStudio, currentStudioId (bootstrap): per confirmBooking
//     che inserisce l'appointment con tenancy corretta
//
// Note:
//   - Zero modifiche di comportamento rispetto al codice originale.
//   - filteredEvents, monthEvents e stats NON sono qui: dipendono dai
//     filtri (filters, statusFilter) che vivono in useSearchAndFilters.
//     Per evitare dipendenze circolari (events → filtri → searchMatchIds
//     → events) restano memoizzati in pagina.
//   - confirmBooking ricarica la settimana corrente, identico
//     all'originale.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { usePrivacyMode, composeInitials } from "@/src/contexts/PrivacyModeContext";
import { translateError } from "@/src/lib/translateError";
import {
  addDays,
  addWeeks,
  formatDMY,
  startOfISOWeekMonday,
  getMonthGridDays,
  type AppointmentParticipant,
  type BookingRequest,
  type CalendarEvent,
  type LocationType,
  type Status,
} from "@/app/(protected)/calendar/utils";
import type { WorkingHourRow } from "./useCalendarBootstrap";

/* ─── tipi ─── */

export interface UseCalendarEventsOptions {
  clientReady: boolean;
  workingHours: WorkingHourRow[];
  currentStudio: {
    id: string;
    name: string | null;
    /** Vista calendario predefinita all'apertura (mig. 023, Fase D) */
    default_calendar_view?: "day" | "week" | "month";
  } | null;
  currentStudioId: string | null;
}

export interface UseCalendarEventsReturn {
  // Stato base
  events: CalendarEvent[];
  setEvents: Dispatch<SetStateAction<CalendarEvent[]>>;
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;

  // Vista corrente
  currentDate: Date;
  setCurrentDate: Dispatch<SetStateAction<Date>>;
  viewType: "day" | "week" | "month";
  setViewType: Dispatch<SetStateAction<"day" | "week" | "month">>;

  // Fetch
  loadAppointments: (
    startDate: Date,
    endDate: Date,
    retryCount?: number
  ) => Promise<void>;

  // Revenue periodo
  weeklyExpectedRevenue: number;

  // Navigazione
  goToPreviousWeek: () => void;
  goToNextWeek: () => void;
  goToToday: () => void;
  gotoWeekStart: (iso: string) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  weekOptions: { value: string; label: string }[];

  // Memos di griglia
  weekDays: Date[];
  monthDays: ReturnType<typeof getMonthGridDays>;

  // Helpers occupazione
  getAvailabilityForecast: (day: Date) => {
    totalEvents: number;
    occupancyRate: number;
  };
  getFreeWindows: (day: Date) => {
    start: Date;
    end: Date;
    minutes: number;
  }[];

  // Aggregati
  dailySummary: {
    total: number;
    done: number;
    notDone: number;
    unpaid: number;
    invoicedTotal: number;
    cashTotal: number;
    grandTotal: number;
    events: CalendarEvent[];
  };

  // Booking requests
  bookingRequests: BookingRequest[];
  setBookingRequests: Dispatch<SetStateAction<BookingRequest[]>>;
  bookingPanel: boolean;
  setBookingPanel: Dispatch<SetStateAction<boolean>>;
  bookingLoading: boolean;
  setBookingLoading: Dispatch<SetStateAction<boolean>>;
  bookingActionId: string | null;
  setBookingActionId: Dispatch<SetStateAction<string | null>>;
  loadBookingRequests: () => Promise<void>;
  confirmBooking: (req: BookingRequest) => Promise<void>;
  rejectBooking: (id: string) => Promise<void>;
  reopenBooking: (id: string) => Promise<void>;
}

/* ─── hook ─── */

export function useCalendarEvents(
  options: UseCalendarEventsOptions
): UseCalendarEventsReturn {
  const {
    clientReady,
    workingHours,
    currentStudio,
    currentStudioId,
  } = options;

  // Modalità privacy: maschera il nome paziente negli eventi (solo visuale).
  const { privacyMode, privacyStyle } = usePrivacyMode();

  /* ─── Stato base ─── */
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewType, setViewType] = useState<"day" | "week" | "month">("week");

  // Hydration-safe: imposta currentDate al mount.
  useEffect(() => {
    setCurrentDate(new Date());
  }, []);

  // Applica la vista predefinita dello studio (mig. 023, Fase D).
  // Una volta per studio: se l'utente cambia studio, applichiamo il suo default.
  // Non sovrascriviamo se l'utente ha già cambiato vista in questa sessione
  // (lo deduciamo dal fatto che l'effect parte solo quando lo studio cambia).
  const lastAppliedStudioId = useRef<string | null>(null);
  useEffect(() => {
    if (!currentStudio?.id) return;
    if (lastAppliedStudioId.current === currentStudio.id) return;
    lastAppliedStudioId.current = currentStudio.id;
    const def = currentStudio.default_calendar_view;
    if (def === "day" || def === "week" || def === "month") {
      setViewType(def);
    }
  }, [currentStudio?.id, currentStudio?.default_calendar_view]);

  /* ─── loadAppointments ─── */
  const loadRequestId = useRef(0);

  const loadAppointments = useCallback(
    async (startDate: Date, endDate: Date, retryCount = 0) => {
      const thisRequest = ++loadRequestId.current;
      setLoading(true);
      setError("");

      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();

      try {
        const { data, error } = await supabase
          .from("appointments")
          .select(
            `
          id, patient_id, start_at, end_at, status, calendar_note, location, clinic_site, location_id, domicile_address, treatment_type, price_type, payment_method, amount,
          expected_price, is_paid, paid_at,
          reminder_sent_at, reminder_status,
          whatsapp_sent_at,
          is_group, group_title, group_max_participants, group_price_per_person,
          package_id,
          operator_id, room_id, guest_practitioner_id,
          convenzione_ente_id, convenzione_auth_code, convenzione_auth_expires,
          patients:patient_id ( first_name, last_name, treatment, diagnosis, phone ),
          appointment_participants (
            id, appointment_id, patient_id, price, payment_status, payment_method, paid_at,
            attendance_status, checked_in_at, participant_notes, created_at,
            patients:patient_id ( first_name, last_name, phone )
          )
        `
          )
          .gte("start_at", startISO)
          .lt("start_at", endISO)
          // mig. 029 → rivoluzione UX (Step rivoluzione): gli appuntamenti
          // dell'ospite NON entrano più nel calendario titolare. Stanno
          // tutti e solo nella sezione /ospiti/[id]. Il calendario titolare
          // mostra esclusivamente "le mie cose".
          .is("guest_practitioner_id", null)
          .order("start_at", { ascending: true });

        // Ignore stale responses
        if (thisRequest !== loadRequestId.current) return;

        if (error) {
          if (retryCount < 2) {
            // Retry after short delay
            setTimeout(
              () => loadAppointments(startDate, endDate, retryCount + 1),
              1000
            );
            return;
          }
          setError(error.message);
          setLoading(false);
          return;
        }

        const mapped = (data ?? []).map(
          (a: {
            id: string;
            patient_id: string;
            start_at: string;
            end_at: string;
            status: string;
            calendar_note?: string | null;
            location?: string | null;
            clinic_site?: string | null;
            location_id?: string | null;
            domicile_address?: string | null;
            treatment_type?: string | null;
            convenzione_ente_id?: string | null;
            convenzione_auth_code?: string | null;
            convenzione_auth_expires?: string | null;
            price_type?: string | null;
            payment_method?: string | null;
            amount?: number | null;
            expected_price?: number | null;
            is_paid?: boolean | null;
            paid_at?: string | null;
            reminder_sent_at?: string | null;
            reminder_status?: string | null;
            whatsapp_sent_at?: string | null;
            // Campi gruppo (mig. 014)
            is_group?: boolean | null;
            group_title?: string | null;
            group_max_participants?: number | null;
            group_price_per_person?: number | null;
            // Pacchetto sedute (mig. 014_packages)
            package_id?: string | null;
            // Multi-operatore + multi-stanza (mig. 019)
            operator_id?: string | null;
            room_id?: string | null;
            // Professionisti ospiti (mig. 029)
            guest_practitioner_id?: string | null;
            patients?: Array<{
              first_name?: string;
              last_name?: string;
              treatment?: string;
              diagnosis?: string;
              phone?: string;
            }>;
            appointment_participants?: Array<{
              id: string;
              appointment_id: string;
              patient_id: string;
              price: number | null;
              payment_status?: string | null;
              payment_method?: string | null;
              paid_at?: string | null;
              attendance_status?: string | null;
              checked_in_at?: string | null;
              participant_notes?: string | null;
              created_at?: string;
              patients?:
                | Array<{
                    first_name?: string;
                    last_name?: string;
                    phone?: string;
                  }>
                | { first_name?: string; last_name?: string; phone?: string }
                | null;
            }>;
          }) => {
            const patient = Array.isArray(a.patients)
              ? a.patients[0]
              : a.patients;
            const isGroup = a.is_group === true;

            // Mapping partecipanti (gruppo)
            const participants: AppointmentParticipant[] = (
              a.appointment_participants ?? []
            ).map((p) => {
              const pp = Array.isArray(p.patients) ? p.patients[0] : p.patients;
              return {
                id: p.id,
                appointment_id: p.appointment_id,
                patient_id: p.patient_id,
                price: Number(p.price ?? 0),
                payment_status: (p.payment_status === "paid"
                  ? "paid"
                  : "unpaid") as "paid" | "unpaid",
                payment_method: (p.payment_method ?? null) as
                  | "cash"
                  | "pos"
                  | "bank_transfer"
                  | null,
                paid_at: p.paid_at ?? null,
                attendance_status: (p.attendance_status === "present" ||
                p.attendance_status === "absent"
                  ? p.attendance_status
                  : "pending") as "pending" | "present" | "absent",
                checked_in_at: p.checked_in_at ?? null,
                participant_notes: p.participant_notes ?? null,
                created_at: p.created_at ?? new Date().toISOString(),
                patient_first_name: pp?.first_name ?? null,
                patient_last_name: pp?.last_name ?? null,
                patient_phone: pp?.phone ?? null,
              };
            });

            // Se non c'è paziente (prenotazione web), estrai nome dal calendar_note
            // Formato: "[WEB|Nome Cognome|Telefono] Servizio..."
            // Per i gruppi, il "nome" è il titolo del gruppo
            let name: string;
            if (isGroup) {
              name = a.group_title || "Gruppo";
            } else {
              name = patient
                ? `${patient.last_name ?? ""} ${patient.first_name ?? ""}`.trim()
                : "Paziente";

              if (!patient && a.calendar_note) {
                const match = (a.calendar_note as string).match(
                  /^\[WEB\|([^|]+)\|/
                );
                if (match && match[1]) name = match[1].trim();
              }
            }

            return {
              id: a.id,
              patient_id: a.patient_id,
              title: name,
              start: new Date(a.start_at),
              end: new Date(a.end_at),
              status: a.status as Status,
              calendar_note: a.calendar_note ?? null,
              location: (a.location as LocationType) ?? null,
              clinic_site: a.clinic_site ?? null,
              location_id: a.location_id ?? null,
              domicile_address: a.domicile_address ?? null,
              treatment_type: a.treatment_type ?? null,
              convenzione_ente_id: a.convenzione_ente_id ?? null,
              convenzione_auth_code: a.convenzione_auth_code ?? null,
              convenzione_auth_expires: a.convenzione_auth_expires ?? null,
              price_type: a.price_type ?? null,
              payment_method: (a.payment_method ?? null) as
                | "cash"
                | "pos"
                | "bank_transfer"
                | null,
              amount: a.amount ?? null,
              expected_price: a.expected_price ?? null,
              is_paid: a.is_paid ?? false,
              paid_at: a.paid_at ? new Date(a.paid_at) : null,
              reminder_sent_at: a.reminder_sent_at
                ? new Date(a.reminder_sent_at)
                : null,
              reminder_status: a.reminder_status ?? null,
              whatsapp_sent_at: a.whatsapp_sent_at
                ? new Date(a.whatsapp_sent_at)
                : null,

              // dati paziente (prima riga della relazione)
              // In Modalità Privacy il nome mostrato negli eventi diventa
              // "Paziente" o le iniziali ("M.R.") in base allo stile scelto
              // (solo per i singoli, non per i gruppi il cui "nome" è il
              // titolo del gruppo, non un dato personale).
              // title resta reale: serve alla logica interna, non al display.
              patient_name: privacyMode && !isGroup
                ? (privacyStyle === "initials" ? composeInitials(patient) : "Paziente")
                : name,
              patient_first_name: patient?.first_name ?? null,
              patient_last_name: patient?.last_name ?? null,
              patient_phone: patient?.phone ?? null,
              treatment: patient?.treatment ?? null,
              diagnosis: patient?.diagnosis ?? null,

              // Gruppo (mig. 014)
              is_group: isGroup,
              group_title: a.group_title ?? null,
              group_max_participants: a.group_max_participants ?? null,
              group_price_per_person: a.group_price_per_person ?? null,
              participants,
              // Pacchetto sedute (mig. 014_packages)
              package_id: a.package_id ?? null,
              // Multi-operatore + multi-stanza (mig. 019)
              operator_id: a.operator_id ?? null,
              room_id: a.room_id ?? null,
              // Professionisti ospiti (mig. 029)
              guest_practitioner_id: a.guest_practitioner_id ?? null,
            };
          }
        );

        setEvents(mapped as CalendarEvent[]);
        setLoading(false);
      } catch (err) {
        if (thisRequest !== loadRequestId.current) return;
        if (retryCount < 2) {
          setTimeout(
            () => loadAppointments(startDate, endDate, retryCount + 1),
            1000
          );
        } else {
          setError(`Errore caricamento: ${translateError(err)}`);
          setLoading(false);
        }
      }
    },
    [privacyMode, privacyStyle]
  );

  /* ─── Auto-fetch quando cambia data/vista ─── */
  useEffect(() => {
    if (!clientReady) return;

    if (viewType === "week") {
      const startOfWeek = startOfISOWeekMonday(currentDate);
      const endOfWeek = addDays(startOfWeek, 7);
      loadAppointments(startOfWeek, endOfWeek);
    } else if (viewType === "month") {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const startOffset =
        firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
      const calStart = addDays(firstDay, -startOffset);
      const calEnd = addDays(calStart, 42);
      loadAppointments(calStart, calEnd);
    } else {
      const startOfDay = new Date(currentDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(23, 59, 59, 999);
      loadAppointments(startOfDay, endOfDay);
    }
  }, [currentDate, viewType, loadAppointments, clientReady]);

  /* ─── weeklyExpectedRevenue ─── */
  const [weeklyExpectedRevenue, setWeeklyExpectedRevenue] =
    useState<number>(0);

  useEffect(() => {
    if (!clientReady) return;
    let cancelled = false;

    const loadPeriodStats = async () => {
      try {
        let periodStart: Date;
        let periodEnd: Date;

        if (viewType === "month") {
          // Intero mese
          periodStart = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            1
          );
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() + 1,
            1
          );
          periodEnd.setHours(0, 0, 0, 0);
        } else {
          // Settimana corrente
          const today = new Date(currentDate);
          const day = today.getDay();
          const diffToMonday = (day === 0 ? -6 : 1) - day;
          periodStart = new Date(today);
          periodStart.setDate(today.getDate() + diffToMonday);
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart);
          periodEnd.setDate(periodStart.getDate() + 7);
          periodEnd.setHours(0, 0, 0, 0);
        }

        const { data, error } = await supabase
          .from("appointments")
          .select("amount, expected_price, status, start_at")
          .gte("start_at", periodStart.toISOString())
          .lt("start_at", periodEnd.toISOString())
          // mig. 029: esclude appuntamenti dei professionisti ospiti dai
          // conteggi incassi del titolare (l'ospite incassa direttamente).
          .is("guest_practitioner_id", null);

        if (error) throw error;

        const rows = data ?? [];
        const validRows = rows.filter((r) => r.status !== "cancelled");

        const revenue = validRows.reduce((sum: number, r) => {
          const v = r.amount ?? r.expected_price ?? 0;
          return sum + Number(v);
        }, 0);

        if (!cancelled) setWeeklyExpectedRevenue(revenue);
      } catch {
        if (!cancelled) setWeeklyExpectedRevenue(0);
      }
    };

    loadPeriodStats();
    return () => {
      cancelled = true;
    };
  }, [currentDate, viewType, clientReady]);

  /* ─── Navigazione ─── */
  const goToPreviousWeek = useCallback(() => {
    setCurrentDate((prev) => addWeeks(prev, -1));
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentDate((prev) => addWeeks(prev, 1));
  }, []);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const gotoWeekStart = useCallback((iso: string) => {
    setCurrentDate(new Date(iso));
  }, []);

  const goToPreviousMonth = useCallback(() => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  }, []);

  // Opzioni settimane per il select nella navbar (±8 settimane dalla corrente)
  const weekOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = startOfISOWeekMonday(new Date());
    for (let i = -8; i <= 8; i++) {
      const weekStart = addWeeks(now, i);
      const weekEnd = addDays(weekStart, 6);
      const mesi = [
        "Gen",
        "Feb",
        "Mar",
        "Apr",
        "Mag",
        "Giu",
        "Lug",
        "Ago",
        "Set",
        "Ott",
        "Nov",
        "Dic",
      ];
      const label = `${formatDMY(weekStart)} – ${weekEnd.getDate()} ${
        mesi[weekEnd.getMonth()]
      }`;
      options.push({ value: weekStart.toISOString(), label });
    }
    return options;
  }, []);

  /* ─── Memos di griglia ─── */
  const weekDays = useMemo(() => {
    const days: Date[] = [];
    const startOfWeek = startOfISOWeekMonday(currentDate);
    for (let i = 0; i < 6; i++) {
      const day = addDays(startOfWeek, i);
      days.push(day);
    }
    return days;
  }, [currentDate]);

  const monthDays = useMemo(() => {
    if (viewType !== "month") return [];
    return getMonthGridDays(currentDate);
  }, [viewType, currentDate]);

  /* ─── Helpers occupazione ─── */
  // Ritorna statistiche occupazione per un giorno (usato nell'header settimana)
  const getAvailabilityForecast = useCallback(
    (day: Date) => {
      const d0 = new Date(day);
      d0.setHours(0, 0, 0, 0);
      const d1 = new Date(day);
      d1.setHours(23, 59, 59, 999);
      const dayEvts = events.filter(
        (ev) => ev.status !== "cancelled" && ev.start >= d0 && ev.start <= d1
      );
      const totalMinutes = 8 * 60; // 8-20 = 12h = 720min, ma usiamo 8h lavorative
      const usedMinutes = dayEvts.reduce((s, ev) => {
        return (
          s + Math.max(0, (ev.end.getTime() - ev.start.getTime()) / 60000)
        );
      }, 0);
      const occupancyRate = Math.round(
        Math.min((usedMinutes / totalMinutes) * 100, 100)
      );
      return { totalEvents: dayEvts.length, occupancyRate };
    },
    [events]
  );

  // Ritorna le finestre libere di un giorno (usato con showAvailableOnly).
  // Usa gli orari di lavoro configurati in working_hours per quel giorno_della_settimana.
  const getFreeWindows = useCallback(
    (day: Date) => {
      const dayOfWeek = day.getDay();
      const wh = workingHours.find((w) => w.day_of_week === dayOfWeek);
      // Se il giorno è chiuso o non configurato, fallback 8-20 (mantiene comportamento storico)
      let workStartH = 8,
        workStartM = 0,
        workEndH = 20,
        workEndM = 0;
      if (wh && wh.is_open) {
        const [oh, om] = wh.open_time.split(":").map(Number);
        const [ch, cm] = wh.close_time.split(":").map(Number);
        workStartH = oh;
        workStartM = om || 0;
        workEndH = ch;
        workEndM = cm || 0;
      } else if (wh && !wh.is_open) {
        return []; // giorno chiuso → nessuna finestra
      }

      const d0 = new Date(day);
      d0.setHours(0, 0, 0, 0);
      const d1 = new Date(day);
      d1.setHours(23, 59, 59, 999);
      const dayEvts = events
        .filter(
          (ev) =>
            ev.status !== "cancelled" && ev.start >= d0 && ev.start <= d1
        )
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      const windows: { start: Date; end: Date; minutes: number }[] = [];
      let cursor = new Date(day);
      cursor.setHours(workStartH, workStartM, 0, 0);
      const workEnd = new Date(day);
      workEnd.setHours(workEndH, workEndM, 0, 0);

      for (const ev of dayEvts) {
        if (ev.start > cursor) {
          const mins = Math.round(
            (ev.start.getTime() - cursor.getTime()) / 60000
          );
          if (mins >= 30)
            windows.push({
              start: new Date(cursor),
              end: new Date(ev.start),
              minutes: mins,
            });
        }
        if (ev.end > cursor) cursor = new Date(ev.end);
      }
      if (cursor < workEnd) {
        const mins = Math.round(
          (workEnd.getTime() - cursor.getTime()) / 60000
        );
        if (mins >= 30)
          windows.push({
            start: new Date(cursor),
            end: new Date(workEnd),
            minutes: mins,
          });
      }
      return windows;
    },
    [events, workingHours]
  );

  /* ─── Aggregati ─── */
  // Riepilogo giornaliero per il modal "Riepilogo di oggi"
  const dailySummary = useMemo(() => {
    const today = new Date();
    const todayEvts = events.filter(
      (ev) =>
        ev.start.getDate() === today.getDate() &&
        ev.start.getMonth() === today.getMonth() &&
        ev.start.getFullYear() === today.getFullYear() &&
        ev.status !== "cancelled"
    );
    const done = todayEvts.filter((ev) => ev.status === "done").length;
    const notDone = todayEvts.filter((ev) => ev.status !== "done").length;
    const unpaid = todayEvts.filter((ev) => !ev.is_paid).length;
    const invoicedTotal = todayEvts
      .filter((ev) => ev.price_type === "invoiced" && ev.is_paid)
      .reduce((s, ev) => s + (ev.amount ?? 0), 0);
    const cashTotal = todayEvts
      .filter((ev) => ev.price_type === "cash" && ev.is_paid)
      .reduce((s, ev) => s + (ev.amount ?? 0), 0);
    const grandTotal = todayEvts
      .filter((ev) => ev.is_paid)
      .reduce((s, ev) => s + (ev.amount ?? 0), 0);
    return {
      total: todayEvts.length,
      done,
      notDone,
      unpaid,
      invoicedTotal,
      cashTotal,
      grandTotal,
      events: todayEvts,
    };
  }, [events]);

  // NOTA: filteredEvents, monthEvents e stats sono calcolati in pagina
  // perché dipendono dai filtri (filters, statusFilter) che vivono in
  // useSearchAndFilters. La pagina compone events + filtri per produrli.

  /* ─── Booking requests ─── */
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>(
    []
  );
  const [bookingPanel, setBookingPanel] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingActionId, setBookingActionId] = useState<string | null>(null);

  const loadBookingRequests = useCallback(async () => {
    setBookingLoading(true);
    const { data } = await supabase
      .from("booking_requests")
      .select("*")
      .in("status", ["pending", "confirmed", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(50);
    setBookingRequests(data ?? []);
    setBookingLoading(false);
  }, []);

  useEffect(() => {
    void loadBookingRequests();
  }, [loadBookingRequests]);

  const confirmBooking = useCallback(
    async (req: BookingRequest) => {
      setBookingActionId(req.id);
      try {
        // 1. Aggiorna stato in booking_requests
        const { error: updErr } = await supabase
          .from("booking_requests")
          .update({ status: "confirmed" })
          .eq("id", req.id);
        if (updErr) {
          alert(`Errore aggiornamento: ${translateError(updErr)}`);
          return;
        }

        // 2. Crea appuntamento — stesso metodo usato dal form del calendario
        const timeStr = req.requested_time.slice(0, 5); // "HH:MM"
        const [th, tm] = timeStr.split(":").map(Number);
        const [dy, dm, dd] = req.requested_date.split("-").map(Number);

        // Costruisce data locale (come fa il form normale del calendario)
        const startDt = new Date(dy, dm - 1, dd);
        startDt.setHours(th, tm, 0, 0);
        if (isNaN(startDt.getTime())) {
          alert("Data non valida");
          return;
        }

        const durationMin = Number(req.service_duration);
        const endDt = new Date(startDt.getTime() + durationMin * 60 * 1000);

        // toISOString() converte in UTC — uguale a come funzionano tutti gli altri appuntamenti
        const startAt = startDt.toISOString();
        const endAt = endDt.toISOString();

        console.log(
          "[booking] start:",
          startAt,
          "end:",
          endAt,
          "durata:",
          durationMin,
          "min"
        );

        const note = `[WEB|${req.patient_name}|${req.patient_phone}] ${
          req.service_name
        }${req.notes ? ` - ${req.notes}` : ""}`;

        // Determina location in base al servizio
        const isHome = req.service_name.toLowerCase().includes("domicil");
        const locationVal = isHome ? "domicile" : "studio";

        const { data: cbUser } = await supabase.auth.getUser();
        const { error: insErr } = await supabase.from("appointments").insert({
          start_at: startAt,
          end_at: endAt,
          status: "booked",
          is_paid: false,
          location: locationVal,
          clinic_site: isHome ? null : currentStudio?.name || "Studio",
          domicile_address: isHome ? req.notes ?? "da definire" : null,
          calendar_note: note,
          studio_id: currentStudioId, // multi-tenancy
          operator_id: cbUser?.user?.id ?? null, // assegna al titolare loggato
        });
        if (insErr) {
          alert(`Errore creazione appuntamento: ${translateError(insErr)}`);
          return;
        }

        await loadBookingRequests();
        // Ricarica il calendario sulla settimana corrente
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(
          currentDate.getDate() - ((currentDate.getDay() + 6) % 7)
        );
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = addDays(startOfWeek, 6);
        endOfWeek.setHours(23, 59, 59, 999);
        await loadAppointments(startOfWeek, endOfWeek);
      } finally {
        setBookingActionId(null);
      }
    },
    [
      currentDate,
      currentStudio,
      currentStudioId,
      loadAppointments,
      loadBookingRequests,
    ]
  );

  const rejectBooking = useCallback(
    async (id: string) => {
      setBookingActionId(id);
      await supabase
        .from("booking_requests")
        .update({ status: "cancelled" })
        .eq("id", id);
      await loadBookingRequests();
      setBookingActionId(null);
    },
    [loadBookingRequests]
  );

  // Rimette in stato "pending" una prenotazione confermata o annullata
  const reopenBooking = useCallback(
    async (id: string) => {
      setBookingActionId(id);
      await supabase
        .from("booking_requests")
        .update({ status: "pending" })
        .eq("id", id);
      await loadBookingRequests();
      setBookingActionId(null);
    },
    [loadBookingRequests]
  );

  return {
    // Stato base
    events,
    setEvents,
    loading,
    setLoading,
    error,
    setError,

    // Vista corrente
    currentDate,
    setCurrentDate,
    viewType,
    setViewType,

    // Fetch
    loadAppointments,

    // Revenue
    weeklyExpectedRevenue,

    // Navigazione
    goToPreviousWeek,
    goToNextWeek,
    goToToday,
    gotoWeekStart,
    goToPreviousMonth,
    goToNextMonth,
    weekOptions,

    // Memos griglia
    weekDays,
    monthDays,

    // Helpers
    getAvailabilityForecast,
    getFreeWindows,

    // Aggregati
    dailySummary,

    // Booking requests
    bookingRequests,
    setBookingRequests,
    bookingPanel,
    setBookingPanel,
    bookingLoading,
    setBookingLoading,
    bookingActionId,
    setBookingActionId,
    loadBookingRequests,
    confirmBooking,
    rejectBooking,
    reopenBooking,
  };
}
