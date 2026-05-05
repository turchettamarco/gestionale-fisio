// ═══════════════════════════════════════════════════════════════════════
// src/hooks/calendar/useCalendarBootstrap.ts
// ═══════════════════════════════════════════════════════════════════════
// Cos'è:
//   Hook tecnico di setup per la pagina /calendar. Raccoglie tutto lo
//   stato di "ambiente" (utente loggato, settings dello studio, catalogo
//   trattamenti dinamico, orari di lavoro, viewport, tick del tempo)
//   precedentemente sparso nelle prime ~700 righe di calendar/page.tsx.
//
// Dove si usa:
//   In app/(protected)/calendar/page.tsx, all'inizio del componente
//   CalendarPageInner. È il primo hook chiamato.
//
// Cosa fa:
//   - Recupera userEmail/userId da supabase auth
//   - Gestisce apertura/chiusura del menu utente (click outside)
//   - Carica practice_settings dello studio
//   - Carica treatment_types (catalogo dinamico) e sincronizza il
//     singleton runtime esposto da ./utils
//   - Carica working_hours e calcola la finestra oraria della griglia
//   - Espone getDefaultAmount (prezzo default dato un trattamento+tipo)
//   - Tick di currentTime ogni 60 secondi (per la linea "ora corrente"
//     del calendario)
//   - Detection viewport (isDesktop / isTablet) con resize listener,
//     più TIME_COL derivato (larghezza colonna oraria responsive)
//   - clientReady (flag idratazione)
//
// Note:
//   - Quando passa da week a tablet/non-desktop, il viewport effect
//     vorrebbe forzare la vista a "day". Per non accoppiare il bootstrap
//     allo state del viewType (che vive nel dominio "events"), il
//     comportamento si attiva solo se il chiamante passa onTabletDetected.
//   - Tutti i side-effect rispettano il pattern { mounted } per evitare
//     setState dopo unmount.
//   - Zero modifiche di comportamento rispetto al codice originale.
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
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import {
  setTreatmentCatalog,
  type PracticeSettings,
  type TreatmentType,
} from "@/app/(protected)/calendar/utils";

/* ─── tipi ─── */

export type TreatmentCatalogRow = {
  key: string;
  label: string;
  color: string;
  price_invoice: number;
  price_cash: number;
  duration_min: number;
};

export type WorkingHourRow = {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_open: boolean;
};

export interface UseCalendarBootstrapOptions {
  /**
   * Callback opzionale invocata quando il viewport diventa tablet
   * (e non è desktop). Replica il comportamento originale che forzava
   * viewType da "week" a "day" su tablet. Se non passato, non viene
   * cambiata alcuna vista.
   */
  onTabletDetected?: () => void;
}

export interface UseCalendarBootstrapReturn {
  // Studio context (passthrough)
  currentStudio: ReturnType<typeof useCurrentStudio>["studio"];
  currentStudioId: string | null;
  studioLocations: ReturnType<typeof useCurrentStudio>["locations"];

  // User
  userEmail: string | null;
  userId: string | null;
  userLabel: string;
  userInitials: string;
  userMenuOpen: boolean;
  setUserMenuOpen: Dispatch<SetStateAction<boolean>>;
  userMenuRef: React.RefObject<HTMLDivElement | null>;
  handleLogout: () => Promise<void>;

  // Practice settings
  practiceSettings: PracticeSettings | null;
  setPracticeSettings: Dispatch<SetStateAction<PracticeSettings | null>>;
  practiceSettingsLoaded: boolean;
  loadPracticeSettings: () => Promise<void>;

  // Treatment catalog
  treatmentCatalog: TreatmentCatalogRow[];
  setTreatmentCatalogState: Dispatch<SetStateAction<TreatmentCatalogRow[]>>;

  // Working hours + grid range
  workingHours: WorkingHourRow[];
  setWorkingHours: Dispatch<SetStateAction<WorkingHourRow[]>>;
  gridHourRange: { start: number; end: number };

  // Pricing helper
  getDefaultAmount: (
    tType: TreatmentType,
    pType: "invoiced" | "cash"
  ) => number;

  // Tempo + idratazione + viewport
  currentTime: Date;
  setCurrentTime: Dispatch<SetStateAction<Date>>;
  clientReady: boolean;
  setClientReady: Dispatch<SetStateAction<boolean>>;
  isDesktop: boolean;
  isTablet: boolean;
  TIME_COL: number;
}

/* ─── hook ─── */

export function useCalendarBootstrap(
  options: UseCalendarBootstrapOptions = {}
): UseCalendarBootstrapReturn {
  const { onTabletDetected } = options;

  // Studio context (multi-tenancy)
  const { studio: currentStudio, locations: studioLocations } =
    useCurrentStudio();
  const currentStudioId = currentStudio?.id ?? null;

  /* ─── User auth + menu ─── */
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        setUserEmail(data?.user?.email ?? null);
        setUserId(data?.user?.id ?? null);
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!userMenuOpen) return;
      const el = userMenuRef.current;
      if (el && !el.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);

  const handleLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setUserMenuOpen(false);
      window.location.href = "/login";
    }
  }, []);

  const userLabel = useMemo(() => {
    if (!userEmail) return "Account";
    const left = userEmail.split("@")[0] || userEmail;
    return left.length > 18 ? left.slice(0, 18) + "…" : left;
  }, [userEmail]);

  const userInitials = useMemo(() => {
    if (!userEmail) return "U";
    const left = userEmail.split("@")[0] || "U";
    const parts = left.replace(/[^a-zA-Z0-9]/g, " ").split(" ").filter(Boolean);
    const a = (parts[0]?.[0] || "U").toUpperCase();
    const b = (parts[1]?.[0] || "").toUpperCase();
    return (a + b).slice(0, 2);
  }, [userEmail]);

  /* ─── Practice settings ─── */
  const [practiceSettings, setPracticeSettings] =
    useState<PracticeSettings | null>(null);
  const [practiceSettingsLoaded, setPracticeSettingsLoaded] = useState(false);

  const loadPracticeSettings = useCallback(async () => {
    if (!userId) return;
    try {
      setPracticeSettingsLoaded(false);
      const { data, error } = await supabase
        .from("practice_settings")
        .select(
          "standard_invoice, standard_cash, machine_invoice, machine_cash, auto_apply_prices, google_review_link, default_appointment_status, overlap_mode, weekly_reminder_message, default_group_price, default_group_max_participants, payment_method_required, default_payment_method"
        )
        .eq("owner_id", userId)
        .maybeSingle();

      if (error) throw error;

      setPracticeSettings({
        standard_invoice: data?.standard_invoice ?? null,
        standard_cash: data?.standard_cash ?? null,
        machine_invoice: data?.machine_invoice ?? null,
        machine_cash: data?.machine_cash ?? null,
        auto_apply_prices: data?.auto_apply_prices ?? null,
        google_review_link: data?.google_review_link ?? null,
        default_appointment_status: (data?.default_appointment_status ??
          "confirmed") as "confirmed" | "booked",
        overlap_mode: ((data as any)?.overlap_mode ?? "warn") as
          | "block"
          | "warn"
          | "visual",
        weekly_reminder_message:
          (data as any)?.weekly_reminder_message ?? null,
        default_group_price: (data as any)?.default_group_price ?? null,
        default_group_max_participants:
          (data as any)?.default_group_max_participants ?? null,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("Impossibile caricare practice_settings:", msg);
      setPracticeSettings(null);
    } finally {
      setPracticeSettingsLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadPracticeSettings();
  }, [userId, loadPracticeSettings]);

  /* ─── Treatment catalog dinamico ─── */
  // Sostituisce la lista hardcoded ALL_TREATMENTS con i trattamenti che
  // l'utente ha configurato in Impostazioni → Catalogo Trattamenti.
  const [treatmentCatalog, setTreatmentCatalogState] = useState<
    TreatmentCatalogRow[]
  >([]);

  useEffect(() => {
    if (!currentStudioId) return;
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("treatment_types")
          .select(
            "key, label, color, price_invoice, price_cash, duration_min, is_active, sort_order"
          )
          .eq("studio_id", currentStudioId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        if (error) throw error;
        if (!mounted) return;
        const rows = (data ?? []).map((r) => ({
          key: r.key as string,
          label: r.label as string,
          color: r.color as string,
          price_invoice: Number(r.price_invoice ?? 0),
          price_cash: Number(r.price_cash ?? 0),
          duration_min: Number(r.duration_min ?? 30),
        }));
        setTreatmentCatalogState(rows);
        // Aggiorna anche il singleton runtime usato da getTreatmentColor/Label/ALL_TREATMENTS
        setTreatmentCatalog(
          rows.map((r) => ({ value: r.key, label: r.label, color: r.color }))
        );
      } catch (e) {
        console.warn(
          "[calendar] errore carica treatment_types:",
          e instanceof Error ? e.message : e
        );
      }
    })();
    return () => {
      mounted = false;
    };
  }, [currentStudioId]);

  /* ─── Working hours + grid range ─── */
  const [workingHours, setWorkingHours] = useState<WorkingHourRow[]>([]);

  useEffect(() => {
    if (!currentStudioId) return;
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("working_hours")
        .select("day_of_week, open_time, close_time, is_open")
        .eq("studio_id", currentStudioId)
        .order("day_of_week");
      if (!mounted) return;
      if (error || !data) {
        setWorkingHours([]);
        return;
      }
      setWorkingHours(data as WorkingHourRow[]);
    })();
    return () => {
      mounted = false;
    };
  }, [currentStudioId]);

  // Calcola la finestra oraria globale della griglia (min open, max close)
  // tra tutti i giorni aperti. Default 7-22 se non ci sono orari configurati.
  const gridHourRange = useMemo(() => {
    const openDays = workingHours.filter((w) => w.is_open);
    if (openDays.length === 0) return { start: 7, end: 22 };
    const parseHour = (t: string): number => {
      const [h] = t.split(":").map(Number);
      return h;
    };
    const parseHourCeil = (t: string): number => {
      const [h, m] = t.split(":").map(Number);
      return m && m > 0 ? h + 1 : h;
    };
    const minStart = Math.min(...openDays.map((w) => parseHour(w.open_time)));
    const maxEnd = Math.max(
      ...openDays.map((w) => parseHourCeil(w.close_time))
    );
    // Margine di +/- 0 per evitare slot vuoti, ma garantisco minimo 1h di range
    const start = Math.max(0, minStart);
    const end = Math.min(24, Math.max(maxEnd, start + 1));
    return { start, end };
  }, [workingHours]);

  /* ─── Helper prezzo default ─── */
  const getDefaultAmount = useCallback(
    (tType: TreatmentType, pType: "invoiced" | "cash") => {
      // 1. Prima cerca nel catalogo dinamico (treatment_types)
      const fromCatalog = treatmentCatalog.find((t) => t.key === tType);
      if (fromCatalog) {
        return pType === "invoiced"
          ? fromCatalog.price_invoice
          : fromCatalog.price_cash;
      }

      // 2. Fallback ai prezzi legacy in practice_settings (per compatibilità con
      //    appuntamenti storici creati prima del catalogo dinamico)
      const fallback =
        tType === "seduta"
          ? pType === "invoiced"
            ? 40
            : 35
          : pType === "invoiced"
          ? 25
          : 20;

      if (!practiceSettings) return fallback;

      if (tType === "seduta") {
        const v =
          pType === "invoiced"
            ? practiceSettings.standard_invoice
            : practiceSettings.standard_cash;
        return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
      } else {
        const v =
          pType === "invoiced"
            ? practiceSettings.machine_invoice
            : practiceSettings.machine_cash;
        return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
      }
    },
    [practiceSettings, treatmentCatalog]
  );

  /* ─── currentTime tick (ogni 60s) ─── */
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  /* ─── clientReady (idratazione) ─── */
  const [clientReady, setClientReady] = useState(false);

  // Nota: nel codice originale questo effect veniva chiamato dopo il setState
  // di currentDate. currentDate ora vive nel dominio "events" (useCalendarEvents).
  // Qui marchiamo solo clientReady: il chiamante può fare il proprio
  // setCurrentDate(new Date()) nel suo effect di mount se necessario.
  useEffect(() => {
    setClientReady(true);
  }, []);

  /* ─── Viewport detection ─── */
  const [isDesktop, setIsDesktop] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // Responsive time column width (replica del codice originale a riga 745)
  const TIME_COL = isTablet && !isDesktop ? 50 : 80;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqlDesktop = window.matchMedia("(min-width: 1024px)");
    const mqlTablet = window.matchMedia(
      "(min-width: 768px) and (max-width: 1199px)"
    );
    const update = () => {
      const desk = mqlDesktop.matches;
      const tab = mqlTablet.matches;
      setIsDesktop(desk);
      setIsTablet(tab);
      // Su tablet: default vista giorno (più comoda touch).
      // Replica del comportamento originale: la pagina passa la callback
      // onTabletDetected che esegue setViewType(prev => prev === "week" ? "day" : prev).
      if (tab && !desk && onTabletDetected) {
        onTabletDetected();
      }
    };
    update();
    if (mqlDesktop.addEventListener) {
      mqlDesktop.addEventListener("change", update);
      mqlTablet.addEventListener("change", update);
    }
    return () => {
      if (mqlDesktop.removeEventListener) {
        mqlDesktop.removeEventListener("change", update);
        mqlTablet.removeEventListener("change", update);
      }
    };
    // onTabletDetected NON è in deps di proposito: vogliamo che il listener
    // venga registrato una sola volta al mount, come nell'originale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // Studio
    currentStudio,
    currentStudioId,
    studioLocations,

    // User
    userEmail,
    userId,
    userLabel,
    userInitials,
    userMenuOpen,
    setUserMenuOpen,
    userMenuRef,
    handleLogout,

    // Practice settings
    practiceSettings,
    setPracticeSettings,
    practiceSettingsLoaded,
    loadPracticeSettings,

    // Treatment catalog
    treatmentCatalog,
    setTreatmentCatalogState,

    // Working hours
    workingHours,
    setWorkingHours,
    gridHourRange,

    // Pricing helper
    getDefaultAmount,

    // Tempo + idratazione + viewport
    currentTime,
    setCurrentTime,
    clientReady,
    setClientReady,
    isDesktop,
    isTablet,
    TIME_COL,
  };
}
