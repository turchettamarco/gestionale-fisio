// ═══════════════════════════════════════════════════════════════════════
// src/hooks/calendar/useSearchAndFilters.ts
// ═══════════════════════════════════════════════════════════════════════
// Cos'è:
//   Hook che raccoglie tutto lo stato di "ricerca e filtri" della pagina
//   /calendar. Estratto da calendar/page.tsx (refactor B3.2).
//
// Dove si usa:
//   In app/(protected)/calendar/page.tsx, dopo useCalendarBootstrap.
//
// Cosa fa:
//   - Ricerca paziente nel modale di creazione appuntamento
//     (q, patientResults, selectedPatient, searchPatients) con debounce
//   - Ricerca paziente per partecipanti gruppo (groupSearchPatients)
//   - Ricerca testuale dentro il calendario (calendarSearch,
//     isSearchActive, searchMatchIds): evidenzia gli appuntamenti che
//     contengono la stringa cercata nel patient_name
//   - Filtri per location/treatmentType/priceType/amount
//   - Filtro per status (statusFilter) e checkbox "solo slot disponibili"
//   - Stato filtri UI (filtersExpanded, filtersPopoverOpen,
//     calendarSearchOpen)
//   - Modalità bulk select (bulkMode, bulkSelected, toggleBulkSelect)
//
// Dipendenze:
//   - events: lista appuntamenti (per calcolare searchMatchIds)
//   - createOpen: serve all'effect di debounce per attivarsi solo quando
//     il modale di creazione è aperto
//   - duplicateMode: serve all'effect di debounce per non resettare il
//     paziente precaricato in modalità duplicazione
//   - setError: per riportare errori di ricerca alla pagina
//
// Note:
//   - Zero modifiche di comportamento rispetto al codice originale.
//   - bulkMarkPaid NON è qui: tocca il DB ed è una mutation, andrà in
//     useAppointmentMutations.
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
import { translateError } from "@/src/lib/translateError";
import type {
  CalendarEvent,
  PatientLite,
  Status,
  TreatmentType,
} from "@/app/(protected)/calendar/utils";

/* ─── tipi ─── */

export type CalendarFilters = {
  location: "all" | "studio" | "domicile";
  /** Filtro sede specifica (multi-sede, mig. 014). "all" = tutte le sedi,
   *  altrimenti l'id della studio_location. Tappa A multi-op/stanza. */
  locationId: "all" | string;
  treatmentType: "all" | TreatmentType;
  priceType: "all" | "invoiced" | "cash";
  minAmount: string;
  maxAmount: string;
};

export interface UseSearchAndFiltersOptions {
  events: CalendarEvent[];
  /**
   * Indica se il modale "crea appuntamento" è aperto.
   * Serve per attivare la ricerca paziente con debounce.
   */
  createOpen: boolean;
  /**
   * Indica se il modale è in modalità duplicazione.
   * Quando true, la search non resetta selectedPatient con query vuota.
   */
  duplicateMode: boolean;
  /**
   * Setter per gli errori di pagina (ricerca paziente fallita).
   */
  setError: Dispatch<SetStateAction<string>>;
}

export interface UseSearchAndFiltersReturn {
  // Ricerca paziente nel modale create
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  searching: boolean;
  setSearching: Dispatch<SetStateAction<boolean>>;
  patientResults: PatientLite[];
  setPatientResults: Dispatch<SetStateAction<PatientLite[]>>;
  selectedPatient: PatientLite | null;
  setSelectedPatient: Dispatch<SetStateAction<PatientLite | null>>;
  searchPatients: (query: string) => Promise<void>;

  // Ricerca paziente per gruppi
  groupSearchPatients: (query: string) => Promise<PatientLite[]>;

  // Ricerca dentro il calendario
  calendarSearch: string;
  setCalendarSearch: Dispatch<SetStateAction<string>>;
  calendarSearchOpen: boolean;
  setCalendarSearchOpen: Dispatch<SetStateAction<boolean>>;
  isSearchActive: boolean;
  searchMatchIds: Set<string>;

  // Filtri UI
  filtersExpanded: boolean;
  setFiltersExpanded: Dispatch<SetStateAction<boolean>>;
  filtersPopoverOpen: boolean;
  setFiltersPopoverOpen: Dispatch<SetStateAction<boolean>>;

  // Filtri valori
  filters: CalendarFilters;
  setFilters: Dispatch<SetStateAction<CalendarFilters>>;
  statusFilter: Status | "all";
  setStatusFilter: Dispatch<SetStateAction<Status | "all">>;
  showAvailableOnly: boolean;
  setShowAvailableOnly: Dispatch<SetStateAction<boolean>>;

  // Bulk select
  bulkMode: boolean;
  setBulkMode: Dispatch<SetStateAction<boolean>>;
  bulkSelected: Set<string>;
  setBulkSelected: Dispatch<SetStateAction<Set<string>>>;
  toggleBulkSelect: (id: string) => void;
}

/* ─── hook ─── */

export function useSearchAndFilters(
  options: UseSearchAndFiltersOptions
): UseSearchAndFiltersReturn {
  const { events, createOpen, duplicateMode, setError } = options;

  /* ─── Ricerca paziente (modale create) ─── */
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [patientResults, setPatientResults] = useState<PatientLite[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientLite | null>(
    null
  );
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchPatients = useCallback(
    async (query: string) => {
      const cleaned = query.trim();
      if (cleaned.length < 2) {
        setPatientResults([]);
        // In modalità duplica il paziente è precaricato dall'appuntamento originale:
        // NON resettarlo solo perché la search è vuota.
        if (!duplicateMode) {
          setSelectedPatient(null);
        }
        return;
      }

      setSearching(true);

      const { data, error } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone, treatment, diagnosis")
        .or(`first_name.ilike.%${cleaned}%,last_name.ilike.%${cleaned}%`)
        .order("last_name", { ascending: true })
        .limit(12);

      setSearching(false);

      if (error) {
        setError(`Errore ricerca paziente: ${translateError(error)}`);
        setPatientResults([]);
        return;
      }

      setPatientResults((data ?? []) as PatientLite[]);
    },
    [duplicateMode, setError]
  );

  // Debounce della ricerca paziente (250ms)
  useEffect(() => {
    if (!createOpen) return;

    // In modalità duplica con q vuota: il paziente è già precaricato,
    // niente search automatica (eviteremmo solo di trovarlo di nuovo,
    // e l'effect side reset di selectedPatient sarebbe deleterio).
    if (duplicateMode && q.trim().length < 2) return;

    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchPatients(q);
    }, 250);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [q, createOpen, searchPatients, duplicateMode]);

  /* ─── Ricerca paziente per gruppi ─── */
  const groupSearchPatients = useCallback(
    async (query: string): Promise<PatientLite[]> => {
      const cleaned = query.trim();
      if (!cleaned) return [];
      const { data, error } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone, treatment, diagnosis")
        .or(`first_name.ilike.%${cleaned}%,last_name.ilike.%${cleaned}%`)
        .order("last_name", { ascending: true })
        .limit(12);
      if (error) {
        console.error("Errore ricerca paziente per gruppo:", error);
        return [];
      }
      return (data ?? []) as PatientLite[];
    },
    []
  );

  /* ─── Ricerca dentro il calendario ─── */
  const [calendarSearch, setCalendarSearch] = useState("");
  const [calendarSearchOpen, setCalendarSearchOpen] = useState(false);

  // Ricerca attiva quando >= 2 caratteri
  const isSearchActive = useMemo(
    () => calendarSearch.trim().length >= 2,
    [calendarSearch]
  );

  // IDs degli eventi che matchano la ricerca
  const searchMatchIds = useMemo(() => {
    const s = new Set<string>();
    if (!isSearchActive) return s;
    const q = calendarSearch.trim().toLowerCase();
    events.forEach((ev) => {
      if (ev.patient_name.toLowerCase().includes(q)) s.add(ev.id);
    });
    return s;
  }, [isSearchActive, calendarSearch, events]);

  /* ─── Filtri UI ─── */
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filtersPopoverOpen, setFiltersPopoverOpen] = useState(false);

  /* ─── Filtri valori ─── */
  const [filters, setFilters] = useState<CalendarFilters>({
    location: "all",
    locationId: "all",
    treatmentType: "all",
    priceType: "all",
    minAmount: "",
    maxAmount: "",
  });

  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);

  /* ─── Bulk select ─── */
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  const toggleBulkSelect = useCallback((id: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return {
    // Ricerca paziente create
    q,
    setQ,
    searching,
    setSearching,
    patientResults,
    setPatientResults,
    selectedPatient,
    setSelectedPatient,
    searchPatients,

    // Ricerca gruppo
    groupSearchPatients,

    // Ricerca calendario
    calendarSearch,
    setCalendarSearch,
    calendarSearchOpen,
    setCalendarSearchOpen,
    isSearchActive,
    searchMatchIds,

    // Filtri UI
    filtersExpanded,
    setFiltersExpanded,
    filtersPopoverOpen,
    setFiltersPopoverOpen,

    // Filtri valori
    filters,
    setFilters,
    statusFilter,
    setStatusFilter,
    showAvailableOnly,
    setShowAvailableOnly,

    // Bulk
    bulkMode,
    setBulkMode,
    bulkSelected,
    setBulkSelected,
    toggleBulkSelect,
  };
}
