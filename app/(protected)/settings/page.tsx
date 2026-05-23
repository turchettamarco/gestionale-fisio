"use client";

// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/settings/page.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Pagina Impostazioni — orchestratore.
// La UI è suddivisa in 12 componenti (in components/sections/) che ricevono
// stato e handler via props. Questo file mantiene:
//   • Lo stato (useState) di tutti i campi
//   • Le funzioni di caricamento/salvataggio verso Supabase
//   • Lo stato di apertura/chiusura delle sezioni accordion
//
// Per modificare l'aspetto di una sezione, edita il file in
// components/sections/<NomeSezione>.tsx.
//
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { usePlanLimits } from "@/src/hooks/usePlanLimits";

// Theme & utils condivisi
import { THEME } from "./components/shared/theme";
import { toMoneyString, toNumberSafe } from "./components/shared/utils";
import {
  type MessageTemplate,
  type PracticeSettingsRow,
  type WorkingHourRow,
  type BookableService,
  type BlockedDay,
  type StudioLocation,
  type StudioMemberRow,
  type StudioRoomRow,
  type GuestPractitionerRow,
  DAY_LABELS,
} from "./components/shared/types";

// Sezioni
import AppNavbar from "@/src/components/AppNavbar";
import StudioBrandingSection from "./components/sections/StudioBrandingSection";
import LocationsSection from "./components/sections/LocationsSection";
import PracticeSection from "./components/sections/PracticeSection";
import PricesSection from "./components/sections/PricesSection";
import TreatmentsSection from "./components/sections/TreatmentsSection";
import WorkingHoursSection from "./components/sections/WorkingHoursSection";
import TemplatesSection from "./components/sections/TemplatesSection";
import CalendarPrefsSection from "./components/sections/CalendarPrefsSection";
import BookableServicesSection from "./components/sections/BookableServicesSection";
import BlockedDaysSection from "./components/sections/BlockedDaysSection";
import ManagementSection from "./components/sections/ManagementSection";
import PasswordSection from "./components/sections/PasswordSection";
import IntegrationsSection from "./components/sections/IntegrationsSection";
import TeamSection from "./components/sections/TeamSection";
import OperatorAbsencesSection from "./components/sections/OperatorAbsencesSection";
import RoomsSection from "./components/sections/RoomsSection";
import GuestPractitionersSection from "./components/sections/GuestPractitionersSection";
import SettingsTabs, { type SettingsTab } from "./components/SettingsTabs";

// ═══════════════════════════════════════════════════════════════════════
// Componente principale
// ═══════════════════════════════════════════════════════════════════════
export default function SettingsPage() {

  // ── Stato globale (feedback) ─────────────────────────────────────────────
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  function flashSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  }

  // ── Tab corrente (raggruppa le sezioni per categoria) ─────────────────────
  const [activeTab, setActiveTab] = useState<SettingsTab>("studio");

  // ── Stato sezioni accordion (apri/chiudi) ────────────────────────────────
  const [showStudio,    setShowStudio]    = useState(true);
  const [showLocations, setShowLocations] = useState(false);
  const [showPractice,  setShowPractice]  = useState(true);
  const [showPrices,    setShowPrices]    = useState(true);
  const [showTreatments, setShowTreatments] = useState(true);
  const [showHours,     setShowHours]     = useState(true);
  const [showTemplates, setShowTemplates] = useState(true);
  const [showServices,  setShowServices]  = useState(false);
  const [showBlockDays, setShowBlockDays] = useState(false);
  const [showGestione,  setShowGestione]  = useState(false);
  const [showPassword,  setShowPassword]  = useState(false);
  const [showBackup,    setShowBackup]    = useState(false);
  // Tab "Team" (mig. 019/020)
  const [showTeam,      setShowTeam]      = useState(true);
  const [showRooms,     setShowRooms]     = useState(true);
  const [showAbsences,  setShowAbsences]  = useState(false);
  const [showGuests,    setShowGuests]    = useState(false); // mig. 029

  // ── Preferenza tab in localStorage ────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("settings_active_tab");
    if (saved === "studio" || saved === "team" || saved === "calendar" || saved === "communications" || saved === "account") {
      setActiveTab(saved);
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("settings_active_tab", activeTab);
  }, [activeTab]);

  // ── Caricamento iniziale ────────────────────────────────────────────────
  const [loadingPractice,  setLoadingPractice]  = useState(true);
  const [savingPractice,   setSavingPractice]   = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // ── Studio (multi-tenancy) ───────────────────────────────────────────────
  const { studio, refresh: refreshStudio, locations: studioLocations, refreshLocations } = useCurrentStudio();
  const planLimits = usePlanLimits();

  const [studioName, setStudioName]                     = useState("");
  const [studioAddress, setStudioAddress]               = useState("");
  const [studioPhone, setStudioPhone]                   = useState("");
  const [studioEmail, setStudioEmail]                   = useState("");
  const [studioGoogleReview, setStudioGoogleReview]     = useState("");
  const [studioSignatureName, setStudioSignatureName]   = useState("");
  const [studioSignatureTitle, setStudioSignatureTitle] = useState("");
  // Iscrizione albo professionale (mig. 034) — per attestati di presenza
  const [professionalRegisterNumber, setProfessionalRegisterNumber] = useState("");
  const [professionalRegisterName, setProfessionalRegisterName]     = useState("TSRM-PSTRP");
  const [studioWebsite, setStudioWebsite]               = useState("");
  const [savingStudio, setSavingStudio]                 = useState(false);
  // Logo studio (multi-tenancy: salvato su studios.logo_base64)
  // Dichiarato qui perché usato dal callback saveStudio sotto.
  const [logoBase64, setLogoBase64]                     = useState("");
  // Notifiche (Fase N2): toggle su tabella studios
  const [notifyEmailEnabled, setNotifyEmailEnabled]     = useState(true);
  const [notifyBellEnabled, setNotifyBellEnabled]       = useState(true);
  const [notifyWaRedirectEnabled, setNotifyWaRedirectEnabled] = useState(true);
  // Toggle UI legacy Prenotazioni dal sito (Fase N2.1)
  const [showBookingCardHome, setShowBookingCardHome]   = useState(false);
  const [showBookingBellCalendar, setShowBookingBellCalendar] = useState(false);

  // ── Multi-sede (mig. 014) ─────────────────────────────────────────────
  // Toggle globale + state separato dal salvataggio studio (può essere
  // attivato/disattivato senza dover salvare tutto il branding).
  const [multiLocationEnabled, setMultiLocationEnabled] = useState(false);
  const [savingMultiToggle, setSavingMultiToggle]       = useState(false);
  const [savingLocation, setSavingLocation]             = useState(false);
  const loadingLocations = false; // Le locations arrivano già pronte dal context

  // ── Multi-operatore (mig. 019 + 020) ─────────────────────────────────
  // Toggle + lista membri (inviti pendenti inclusi) + handler CRUD
  const [multiOperatorEnabled, setMultiOperatorEnabled] = useState(false);
  const [savingMultiOpToggle, setSavingMultiOpToggle]   = useState(false);
  const [members, setMembers]                           = useState<StudioMemberRow[]>([]);
  const [loadingMembers, setLoadingMembers]             = useState(true);
  const [savingMember, setSavingMember]                 = useState(false);
  const [currentUserId, setCurrentUserId]               = useState<string | null>(null);
  // Layout vista settimana multi-operatore (mig. 022)
  const [weeklyViewLayout, setWeeklyViewLayout]         = useState<"classic" | "timeline" | "pile" | "grid" | "roster">("classic");
  const [savingWeeklyLayout, setSavingWeeklyLayout]     = useState(false);
  // Vista predefinita all'apertura calendario (mig. 023, Fase D)
  const [defaultCalendarView, setDefaultCalendarView]   = useState<"day" | "week" | "month">("week");
  const [savingDefaultCalendarView, setSavingDefaultCalendarView] = useState(false);

  // ── Multi-stanza (mig. 019 + 020) ────────────────────────────────────
  const [multiRoomEnabled, setMultiRoomEnabled]         = useState(false);
  const [savingMultiRoomToggle, setSavingMultiRoomToggle] = useState(false);
  const [rooms, setRooms]                               = useState<StudioRoomRow[]>([]);
  const [loadingRooms, setLoadingRooms]                 = useState(true);
  const [savingRoom, setSavingRoom]                     = useState(false);

  // ── Professionisti ospiti (mig. 029) ─────────────────────────────────
  const [guestEnabled, setGuestEnabled]                 = useState(false);
  const [savingGuestToggle, setSavingGuestToggle]       = useState(false);
  // mig. 031 — Toggle pagina indice ospiti
  const [useGuestIndex, setUseGuestIndex]               = useState(false);
  const [savingGuestIndexToggle, setSavingGuestIndexToggle] = useState(false);
  const [guests, setGuests]                             = useState<GuestPractitionerRow[]>([]);
  const [loadingGuests, setLoadingGuests]               = useState(true);
  const [savingGuest, setSavingGuest]                   = useState(false);

  // ── Trattamenti (per la RoomsSection) ─────────────────────────────────
  // Caricati separatamente perché la RoomsSection ha bisogno della lista
  // dei trattamenti per il selettore "trattamenti consentiti".
  const [allTreatments, setAllTreatments] = useState<Array<{
    id: string; key: string; label: string; color: string;
    price_invoice: number; price_cash: number; duration_min: number;
    is_active: boolean; sort_order: number; is_builtin: boolean;
    studio_id: string;
  }>>([]);

  // ── Prezzi di gruppo (mig. 014) ──────────────────────────────────────────
  // Dichiarati qui in alto perché usati da saveGroupStats (sotto saveStudio).
  const [defaultGroupPrice, setDefaultGroupPrice]                     = useState("15.00");
  const [defaultGroupMaxParticipants, setDefaultGroupMaxParticipants] = useState("6");
  const [groupStatsCountAsSeparate, setGroupStatsCountAsSeparate]     = useState(false);
  const [savingGroupStats, setSavingGroupStats]                       = useState(false);

  // Popola i campi studio quando arriva il contesto
  useEffect(() => {
    if (!studio) return;
    setStudioName(studio.name || "");
    setStudioAddress(studio.address || "");
    setStudioPhone(studio.phone || "");
    setStudioEmail(studio.email || "");
    setStudioGoogleReview(studio.google_review_link || "");
    setStudioSignatureName(studio.signature_name || "");
    setStudioSignatureTitle(studio.signature_title || "");
    // Iscrizione albo professionale (mig. 034)
    setProfessionalRegisterNumber(
      ((studio as unknown as { professional_register_number?: string | null })
        .professional_register_number) || ""
    );
    setProfessionalRegisterName(
      ((studio as unknown as { professional_register_name?: string | null })
        .professional_register_name) || "TSRM-PSTRP"
    );
    setStudioWebsite(studio.website || "");
    // Logo: ora gestito sulla tabella studios (multi-tenancy)
    setLogoBase64(studio.logo_base64 || "");
    // Notifiche (Fase N2)
    setNotifyEmailEnabled(studio.notify_email_enabled ?? true);
    setNotifyBellEnabled(studio.notify_bell_enabled ?? true);
    setNotifyWaRedirectEnabled(studio.notify_wa_redirect_enabled ?? true);
    // UI legacy Prenotazioni dal sito (Fase N2.1)
    setShowBookingCardHome(studio.show_booking_card_home ?? false);
    setShowBookingBellCalendar(studio.show_booking_bell_calendar ?? false);
    // Multi-sede (mig. 014)
    setMultiLocationEnabled(studio.multi_location_enabled ?? false);
    // Appuntamenti di gruppo (mig. 014) — cast perché StudioContext potrebbe
    // non avere ancora il campo nel tipo TypeScript
    setGroupStatsCountAsSeparate(
      ((studio as unknown as { group_stats_count_as_separate?: boolean | null })
        .group_stats_count_as_separate) ?? false
    );
  }, [studio]);

  const saveStudio = useCallback(async () => {
    if (!studio?.id) { alert("Studio non disponibile"); return; }
    if (!studioName.trim()) { alert("Il nome dello studio è obbligatorio"); return; }
    setSavingStudio(true);
    try {
      const { error } = await supabase.from("studios").update({
        name:               studioName.trim(),
        address:            studioAddress.trim() || null,
        phone:              studioPhone.trim() || null,
        email:              studioEmail.trim() || null,
        google_review_link: studioGoogleReview.trim() || null,
        signature_name:     studioSignatureName.trim() || null,
        signature_title:    studioSignatureTitle.trim() || null,
        // Iscrizione albo professionale (mig. 034)
        professional_register_number: professionalRegisterNumber.trim() || null,
        professional_register_name:   professionalRegisterName.trim() || "TSRM-PSTRP",
        website:            studioWebsite.trim() || null,
        logo_base64:        logoBase64 || null,
        // Notifiche (Fase N2)
        notify_email_enabled:        notifyEmailEnabled,
        notify_bell_enabled:         notifyBellEnabled,
        notify_wa_redirect_enabled:  notifyWaRedirectEnabled,
        // UI legacy Prenotazioni dal sito (Fase N2.1)
        show_booking_card_home:      showBookingCardHome,
        show_booking_bell_calendar:  showBookingBellCalendar,
      }).eq("id", studio.id);
      if (error) { alert("Errore: " + error.message); return; }
      await refreshStudio();
      flashSuccess("Studio salvato.");
    } finally {
      setSavingStudio(false);
    }
  }, [studio, studioName, studioAddress, studioPhone, studioEmail,
      studioGoogleReview, studioSignatureName, studioSignatureTitle, studioWebsite,
      professionalRegisterNumber, professionalRegisterName,
      logoBase64,
      notifyEmailEnabled, notifyBellEnabled, notifyWaRedirectEnabled,
      showBookingCardHome, showBookingBellCalendar,
      refreshStudio]);

  // ── Salvataggio toggle statistiche gruppo (su tabella studios, mig. 014) ─
  // Funzione separata da saveStudio() perché viene chiamata dal pulsante
  // "Salva impostazioni gruppo" in PricesSection (insieme a savePracticeSettings).
  const saveGroupStats = useCallback(async () => {
    if (!studio?.id) return;
    setSavingGroupStats(true);
    try {
      const { error } = await supabase
        .from("studios")
        .update({ group_stats_count_as_separate: groupStatsCountAsSeparate })
        .eq("id", studio.id);
      if (error) {
        alert("Errore salvataggio impostazione statistiche gruppo: " + error.message);
        return;
      }
      await refreshStudio();
    } finally {
      setSavingGroupStats(false);
    }
  }, [studio?.id, groupStatsCountAsSeparate, refreshStudio]);

  // ── Multi-sede: salvataggio toggle multi_location_enabled ─────────────
  const saveMultiLocationToggle = useCallback(async () => {
    if (!studio?.id) { alert("Studio non disponibile"); return; }
    setSavingMultiToggle(true);
    try {
      const { error } = await supabase
        .from("studios")
        .update({ multi_location_enabled: multiLocationEnabled })
        .eq("id", studio.id);
      if (error) {
        alert("Errore salvataggio multi-sede: " + error.message);
        return;
      }
      await refreshStudio();
      flashSuccess(multiLocationEnabled ? "Multi-sede attivato." : "Multi-sede disattivato.");
    } finally {
      setSavingMultiToggle(false);
    }
  }, [studio?.id, multiLocationEnabled, refreshStudio]);

  // ── Multi-sede: CRUD studio_locations ─────────────────────────────────
  const createLocation = useCallback(async (payload: { name: string; address: string; border_color: string | null }) => {
    if (!studio?.id) return;
    setSavingLocation(true);
    try {
      // Calcola sort_order = max corrente + 1
      const maxSort = studioLocations.reduce((m, l) => Math.max(m, l.sort_order ?? 0), 0);
      const { error } = await supabase.from("studio_locations").insert({
        studio_id: studio.id,
        name: payload.name,
        address: payload.address || null,
        is_primary: studioLocations.length === 0,  // se è la prima → principale
        border_color: payload.border_color,
        sort_order: maxSort + 1,
      });
      if (error) { alert("Errore creazione sede: " + error.message); return; }
      await refreshLocations();
      flashSuccess("Sede aggiunta.");
    } finally {
      setSavingLocation(false);
    }
  }, [studio?.id, studioLocations, refreshLocations]);

  const updateLocation = useCallback(async (id: string, payload: Partial<{ name: string; address: string; border_color: string | null }>) => {
    if (!studio?.id) return;
    setSavingLocation(true);
    try {
      const upd: Record<string, unknown> = {};
      if (payload.name !== undefined) upd.name = payload.name;
      if (payload.address !== undefined) upd.address = payload.address || null;
      if (payload.border_color !== undefined) upd.border_color = payload.border_color;
      const { error } = await supabase.from("studio_locations").update(upd).eq("id", id);
      if (error) { alert("Errore aggiornamento sede: " + error.message); return; }
      await refreshLocations();
      flashSuccess("Sede aggiornata.");
    } finally {
      setSavingLocation(false);
    }
  }, [studio?.id, refreshLocations]);

  const deleteLocation = useCallback(async (id: string) => {
    if (!studio?.id) return;
    setSavingLocation(true);
    try {
      // Pulisce anche eventuali appointments.location_id che puntavano qui
      // (la FK è ON DELETE SET NULL, quindi la cancellazione è sicura).
      const { error } = await supabase.from("studio_locations").delete().eq("id", id);
      if (error) { alert("Errore eliminazione sede: " + error.message); return; }
      await refreshLocations();
      flashSuccess("Sede rimossa.");
    } finally {
      setSavingLocation(false);
    }
  }, [studio?.id, refreshLocations]);

  const setPrimaryLocation = useCallback(async (id: string) => {
    if (!studio?.id) return;
    setSavingLocation(true);
    try {
      // Step 1: smarca tutte le altre come non-primary (vincolo unico studio_id+is_primary).
      const { error: errOff } = await supabase
        .from("studio_locations")
        .update({ is_primary: false })
        .eq("studio_id", studio.id);
      if (errOff) { alert("Errore: " + errOff.message); return; }

      // Step 2: marca la sede selezionata come principale + azzera border_color
      // (la principale per convenzione non ha bordo distintivo).
      const { error: errOn } = await supabase
        .from("studio_locations")
        .update({ is_primary: true, border_color: null })
        .eq("id", id);
      if (errOn) { alert("Errore: " + errOn.message); return; }

      await refreshLocations();
      flashSuccess("Sede principale aggiornata.");
    } finally {
      setSavingLocation(false);
    }
  }, [studio?.id, refreshLocations]);


  // ════════════════════════════════════════════════════════════════════
  // ── Multi-operatore (mig. 019 + 020) ────────────────────────────────
  // ════════════════════════════════════════════════════════════════════

  // Carica tutti i membri (attivi + inviti pendenti) dello studio.
  const loadMembers = useCallback(async () => {
    if (!studio?.id) return;
    setLoadingMembers(true);
    try {
      const { data, error } = await supabase
        .from("studio_members")
        .select("id, studio_id, user_id, role, display_name, display_color, signature_short, is_active, sort_order, email, invite_token, invited_at")
        .eq("studio_id", studio.id)
        .eq("is_active", true)
        .order("role", { ascending: true })  // owner first
        .order("sort_order", { ascending: true });
      if (error) {
        console.error("Errore loadMembers:", error);
        setMembers([]);
        return;
      }
      setMembers((data || []) as StudioMemberRow[]);
    } finally {
      setLoadingMembers(false);
    }
  }, [studio?.id]);

  // Inizializza currentUserId + flag multi_operator + carica members
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setCurrentUserId(data.user?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (studio?.id) {
      setMultiOperatorEnabled(Boolean(studio.multi_operator_enabled));
      setMultiRoomEnabled(Boolean(studio.multi_room_enabled));
      // mig. 022 + 024 — hidrata layout vista settimana (default 'classic')
      const layout = studio.weekly_view_layout;
      if (layout === "classic" || layout === "timeline" || layout === "pile" || layout === "grid" || layout === "roster") {
        setWeeklyViewLayout(layout);
      } else {
        setWeeklyViewLayout("classic");
      }
      // mig. 023 — hidrata vista predefinita calendario (default 'week')
      const dv = studio.default_calendar_view;
      if (dv === "day" || dv === "week" || dv === "month") {
        setDefaultCalendarView(dv);
      } else {
        setDefaultCalendarView("week");
      }
      void loadMembers();
    }
  }, [studio?.id, studio?.multi_operator_enabled, studio?.multi_room_enabled, studio?.weekly_view_layout, studio?.default_calendar_view, loadMembers]);

  const saveMultiOperatorToggle = useCallback(async () => {
    if (!studio?.id) { alert("Studio non disponibile"); return; }
    setSavingMultiOpToggle(true);
    try {
      const { error } = await supabase
        .from("studios")
        .update({ multi_operator_enabled: multiOperatorEnabled })
        .eq("id", studio.id);
      if (error) {
        alert("Errore salvataggio multi-operatore: " + error.message);
        return;
      }
      await refreshStudio();
      flashSuccess(multiOperatorEnabled ? "Multi-operatore attivato." : "Multi-operatore disattivato.");
    } finally {
      setSavingMultiOpToggle(false);
    }
  }, [studio?.id, multiOperatorEnabled, refreshStudio]);

  // Salva il layout vista settimana (mig. 022). Vive su `studios` ed è
  // studio-wide. Handler dedicato perché ha il suo bottone "Salva layout"
  // nella TeamSection.
  const saveWeeklyLayout = useCallback(async () => {
    if (!studio?.id) { alert("Studio non disponibile"); return; }
    setSavingWeeklyLayout(true);
    try {
      const { error } = await supabase
        .from("studios")
        .update({ weekly_view_layout: weeklyViewLayout })
        .eq("id", studio.id);
      if (error) {
        alert("Errore salvataggio layout: " + error.message);
        return;
      }
      await refreshStudio();
      flashSuccess("Layout settimana aggiornato.");
    } finally {
      setSavingWeeklyLayout(false);
    }
  }, [studio?.id, weeklyViewLayout, refreshStudio]);

  // Salva la vista predefinita calendario (mig. 023, Fase D). Vive su
  // `studios.default_calendar_view`. Studio-wide: vale per tutti i membri.
  const saveDefaultCalendarView = useCallback(async () => {
    if (!studio?.id) { alert("Studio non disponibile"); return; }
    setSavingDefaultCalendarView(true);
    try {
      const { error } = await supabase
        .from("studios")
        .update({ default_calendar_view: defaultCalendarView })
        .eq("id", studio.id);
      if (error) {
        alert("Errore salvataggio vista predefinita: " + error.message);
        return;
      }
      await refreshStudio();
      const labelMap = { day: "Giorno", week: "Settimana", month: "Mese" };
      flashSuccess(`Vista predefinita aggiornata: ${labelMap[defaultCalendarView]}.`);
    } finally {
      setSavingDefaultCalendarView(false);
    }
  }, [studio?.id, defaultCalendarView, refreshStudio]);

  // Genera un nuovo invito (placeholder con user_id = NULL, invite_token = uuid).
  // Restituisce il token così la UI può mostrare subito il link da copiare.
  const createInvite = useCallback(async (payload: {
    display_name: string;
    email: string;
    role: StudioMemberRow["role"];
    display_color: string;
    signature_short: string;
  }): Promise<{ inviteToken: string } | null> => {
    if (!studio?.id) { alert("Studio non disponibile"); return null; }
    setSavingMember(true);
    try {
      // Verifica che la mail non sia già usata da un membro/invito esistente
      const existing = members.find(m =>
        m.email && m.email.toLowerCase() === payload.email.toLowerCase()
      );
      if (existing) {
        alert(`L'email ${payload.email} è già usata${existing.user_id == null ? " da un invito pendente" : " da un membro"}. Annulla l'invito esistente prima di crearne uno nuovo.`);
        return null;
      }

      // Genera un UUID lato client (compatibile con tutti i browser moderni)
      const inviteToken = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });

      const maxSort = members.reduce((m, x) => Math.max(m, x.sort_order ?? 0), 0);
      const { error } = await supabase.from("studio_members").insert({
        studio_id: studio.id,
        user_id: null,
        role: payload.role,
        display_name: payload.display_name,
        display_color: payload.display_color,
        signature_short: payload.signature_short,
        is_active: true,
        sort_order: maxSort + 1,
        email: payload.email,
        invite_token: inviteToken,
        invited_at: new Date().toISOString(),
      });
      if (error) {
        alert("Errore creazione invito: " + error.message);
        return null;
      }

      await loadMembers();
      flashSuccess(`Invito creato per ${payload.email}. Copia il link e condividilo.`);
      return { inviteToken };
    } finally {
      setSavingMember(false);
    }
  }, [studio?.id, members, loadMembers]);

  // Aggiorna un membro esistente. La chiave è user_id (per membri attivi) o
  // invite_token (per inviti pendenti). isToken distingue i due casi.
  const updateMember = useCallback(async (
    userIdOrToken: string,
    isToken: boolean,
    payload: Partial<{
      display_name: string;
      role: StudioMemberRow["role"];
      display_color: string;
      signature_short: string;
    }>
  ) => {
    if (!studio?.id) return;
    setSavingMember(true);
    try {
      const upd: Record<string, unknown> = {};
      if (payload.display_name !== undefined) upd.display_name = payload.display_name;
      if (payload.role !== undefined) upd.role = payload.role;
      if (payload.display_color !== undefined) upd.display_color = payload.display_color;
      if (payload.signature_short !== undefined) upd.signature_short = payload.signature_short;

      const query = supabase
        .from("studio_members")
        .update(upd)
        .eq("studio_id", studio.id);
      const { error } = await (isToken
        ? query.eq("invite_token", userIdOrToken)
        : query.eq("user_id", userIdOrToken));
      if (error) {
        alert("Errore aggiornamento membro: " + error.message);
        return;
      }
      await loadMembers();
      flashSuccess("Membro aggiornato.");
    } finally {
      setSavingMember(false);
    }
  }, [studio?.id, loadMembers]);

  // Elimina un membro (cancellazione fisica dell'invito pendente, oppure
  // is_active=false per i membri attivi → preserva integrità storica).
  const deleteMember = useCallback(async (
    userIdOrToken: string,
    isToken: boolean
  ) => {
    if (!studio?.id) return;
    setSavingMember(true);
    try {
      if (isToken) {
        // Invito pendente: DELETE fisico
        const { error } = await supabase
          .from("studio_members")
          .delete()
          .eq("studio_id", studio.id)
          .eq("invite_token", userIdOrToken);
        if (error) {
          alert("Errore annullamento invito: " + error.message);
          return;
        }
        flashSuccess("Invito annullato.");
      } else {
        // Membro attivo: soft-delete → is_active = false (mantiene FK su appuntamenti)
        const { error } = await supabase
          .from("studio_members")
          .update({ is_active: false })
          .eq("studio_id", studio.id)
          .eq("user_id", userIdOrToken);
        if (error) {
          alert("Errore rimozione membro: " + error.message);
          return;
        }
        flashSuccess("Membro rimosso dal team.");
      }
      await loadMembers();
    } finally {
      setSavingMember(false);
    }
  }, [studio?.id, loadMembers]);


  // ════════════════════════════════════════════════════════════════════
  // ── Multi-stanza (mig. 019 + 020) ───────────────────────────────────
  // ════════════════════════════════════════════════════════════════════

  // Carica le stanze attive dello studio
  const loadRooms = useCallback(async () => {
    if (!studio?.id) return;
    setLoadingRooms(true);
    try {
      const { data, error } = await supabase
        .from("studio_rooms")
        .select("id, studio_id, location_id, name, color, is_active, sort_order, treatment_types, created_at, updated_at")
        .eq("studio_id", studio.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) {
        console.error("Errore loadRooms:", error);
        setRooms([]);
        return;
      }
      setRooms((data || []) as StudioRoomRow[]);
    } finally {
      setLoadingRooms(false);
    }
  }, [studio?.id]);

  // Carica anche i trattamenti (per la RoomsSection)
  const loadAllTreatments = useCallback(async () => {
    if (!studio?.id) return;
    try {
      const { data, error } = await supabase
        .from("treatment_types")
        .select("id, studio_id, key, label, color, price_invoice, price_cash, duration_min, is_active, sort_order, is_builtin")
        .eq("studio_id", studio.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) {
        setAllTreatments([]);
        return;
      }
      setAllTreatments((data || []) as typeof allTreatments);
    } catch {
      setAllTreatments([]);
    }
  }, [studio?.id]);

  useEffect(() => {
    if (studio?.id) {
      void loadRooms();
      void loadAllTreatments();
    }
  }, [studio?.id, loadRooms, loadAllTreatments]);

  const saveMultiRoomToggle = useCallback(async () => {
    if (!studio?.id) { alert("Studio non disponibile"); return; }
    setSavingMultiRoomToggle(true);
    try {
      const { error } = await supabase
        .from("studios")
        .update({ multi_room_enabled: multiRoomEnabled })
        .eq("id", studio.id);
      if (error) {
        alert("Errore salvataggio multi-stanza: " + error.message);
        return;
      }
      await refreshStudio();
      flashSuccess(multiRoomEnabled ? "Multi-stanza attivato." : "Multi-stanza disattivato.");
    } finally {
      setSavingMultiRoomToggle(false);
    }
  }, [studio?.id, multiRoomEnabled, refreshStudio]);

  const createRoom = useCallback(async (payload: {
    name: string;
    color: string | null;
    location_id: string | null;
    treatment_types: string[] | null;
  }) => {
    if (!studio?.id) return;
    setSavingRoom(true);
    try {
      const maxSort = rooms.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0);
      const { error } = await supabase.from("studio_rooms").insert({
        studio_id: studio.id,
        location_id: payload.location_id,
        name: payload.name,
        color: payload.color,
        is_active: true,
        sort_order: maxSort + 1,
        treatment_types: payload.treatment_types,
      });
      if (error) { alert("Errore creazione stanza: " + error.message); return; }
      await loadRooms();
      flashSuccess("Stanza aggiunta.");
    } finally {
      setSavingRoom(false);
    }
  }, [studio?.id, rooms, loadRooms]);

  const updateRoom = useCallback(async (id: string, payload: Partial<{
    name: string;
    color: string | null;
    location_id: string | null;
    treatment_types: string[] | null;
  }>) => {
    if (!studio?.id) return;
    setSavingRoom(true);
    try {
      const upd: Record<string, unknown> = {};
      if (payload.name !== undefined) upd.name = payload.name;
      if (payload.color !== undefined) upd.color = payload.color;
      if (payload.location_id !== undefined) upd.location_id = payload.location_id;
      if (payload.treatment_types !== undefined) upd.treatment_types = payload.treatment_types;

      const { error } = await supabase
        .from("studio_rooms")
        .update(upd)
        .eq("id", id);
      if (error) { alert("Errore aggiornamento stanza: " + error.message); return; }
      await loadRooms();
      flashSuccess("Stanza aggiornata.");
    } finally {
      setSavingRoom(false);
    }
  }, [studio?.id, loadRooms]);

  const deleteRoom = useCallback(async (id: string) => {
    if (!studio?.id) return;
    setSavingRoom(true);
    try {
      // Soft-delete (is_active = false): preserva integrità FK su appuntamenti
      const { error } = await supabase
        .from("studio_rooms")
        .update({ is_active: false })
        .eq("id", id);
      if (error) { alert("Errore eliminazione stanza: " + error.message); return; }
      await loadRooms();
      flashSuccess("Stanza eliminata.");
    } finally {
      setSavingRoom(false);
    }
  }, [studio?.id, loadRooms]);


  // ── Professionisti ospiti (mig. 029) ─────────────────────────────────
  // Caricamento e CRUD. Stesso pattern delle stanze: Supabase JS diretto,
  // niente API REST. Soft-delete via is_active=FALSE per preservare gli
  // appuntamenti già creati.
  const loadGuests = useCallback(async () => {
    if (!studio?.id) return;
    setLoadingGuests(true);
    try {
      const { data, error } = await supabase
        .from("guest_practitioners")
        .select("*")
        .eq("studio_id", studio.id)
        .order("sort_order", { ascending: true })
        .order("last_name", { ascending: true });
      if (error) {
        console.error("Errore loadGuests:", error);
        setGuests([]);
        return;
      }
      setGuests((data || []) as GuestPractitionerRow[]);
    } finally {
      setLoadingGuests(false);
    }
  }, [studio?.id]);

  // Carico il flag guest_practitioners_enabled dal record studio e gli ospiti
  useEffect(() => {
    if (!studio?.id) return;
    setGuestEnabled(Boolean((studio as { guest_practitioners_enabled?: boolean }).guest_practitioners_enabled));
    // mig. 031 — flag pagina indice
    setUseGuestIndex(Boolean((studio as { use_guest_index_page?: boolean }).use_guest_index_page));
    void loadGuests();
  }, [studio?.id, loadGuests]);

  const saveGuestToggle = useCallback(async () => {
    if (!studio?.id) return;
    setSavingGuestToggle(true);
    try {
      const { error } = await supabase
        .from("studios")
        .update({ guest_practitioners_enabled: guestEnabled })
        .eq("id", studio.id);
      if (error) { alert("Errore salvataggio: " + error.message); return; }
      await refreshStudio();
      flashSuccess(guestEnabled ? "Professionisti ospiti attivati." : "Professionisti ospiti disattivati.");
    } finally {
      setSavingGuestToggle(false);
    }
  }, [studio?.id, guestEnabled, refreshStudio]);

  // mig. 031 — saver toggle pagina indice
  const saveGuestIndexToggle = useCallback(async () => {
    if (!studio?.id) return;
    setSavingGuestIndexToggle(true);
    try {
      const { error } = await supabase
        .from("studios")
        .update({ use_guest_index_page: useGuestIndex })
        .eq("id", studio.id);
      if (error) { alert("Errore salvataggio: " + error.message); return; }
      await refreshStudio();
      flashSuccess(useGuestIndex ? "Pagina indice ospiti attivata." : "Pagina indice ospiti disattivata.");
    } finally {
      setSavingGuestIndexToggle(false);
    }
  }, [studio?.id, useGuestIndex, refreshStudio]);

  const createGuest = useCallback(async (payload: {
    first_name: string;
    last_name: string;
    specialty: string;
    display_color: string | null;
    default_room_id: string | null;
    notes: string | null;
    phone: string | null;
    email: string | null;
    pdf_print_fields: {
      telefono: boolean;
      durata: boolean;
      diagnosi: boolean;
      note: boolean;
    };
  }) => {
    if (!studio?.id) return;
    setSavingGuest(true);
    try {
      const maxSort = guests.reduce((m, g) => Math.max(m, g.sort_order ?? 0), 0);
      const { error } = await supabase.from("guest_practitioners").insert({
        studio_id: studio.id,
        first_name: payload.first_name,
        last_name: payload.last_name,
        specialty: payload.specialty,
        display_color: payload.display_color,
        default_room_id: payload.default_room_id,
        notes: payload.notes,
        phone: payload.phone,
        email: payload.email,
        is_active: true,
        sort_order: maxSort + 1,
        // mig. 030 — configurazione campi PDF (default tutto true)
        pdf_print_fields: payload.pdf_print_fields,
      });
      if (error) { alert("Errore creazione: " + error.message); return; }
      await loadGuests();
      flashSuccess("Professionista aggiunto.");
    } finally {
      setSavingGuest(false);
    }
  }, [studio?.id, guests, loadGuests]);

  const updateGuest = useCallback(async (id: string, payload: Partial<{
    first_name: string;
    last_name: string;
    specialty: string;
    display_color: string | null;
    default_room_id: string | null;
    notes: string | null;
    phone: string | null;
    email: string | null;
    pdf_print_fields: {
      telefono: boolean;
      durata: boolean;
      diagnosi: boolean;
      note: boolean;
    };
  }>) => {
    if (!studio?.id) return;
    setSavingGuest(true);
    try {
      const upd: Record<string, unknown> = {};
      if (payload.first_name !== undefined) upd.first_name = payload.first_name;
      if (payload.last_name !== undefined) upd.last_name = payload.last_name;
      if (payload.specialty !== undefined) upd.specialty = payload.specialty;
      if (payload.display_color !== undefined) upd.display_color = payload.display_color;
      if (payload.default_room_id !== undefined) upd.default_room_id = payload.default_room_id;
      if (payload.notes !== undefined) upd.notes = payload.notes;
      if (payload.phone !== undefined) upd.phone = payload.phone;
      if (payload.email !== undefined) upd.email = payload.email;
      // mig. 030 — campi PDF
      if (payload.pdf_print_fields !== undefined) upd.pdf_print_fields = payload.pdf_print_fields;

      const { error } = await supabase
        .from("guest_practitioners")
        .update(upd)
        .eq("id", id);
      if (error) { alert("Errore aggiornamento: " + error.message); return; }
      await loadGuests();
      flashSuccess("Professionista aggiornato.");
    } finally {
      setSavingGuest(false);
    }
  }, [studio?.id, loadGuests]);

  const deleteGuest = useCallback(async (id: string) => {
    if (!studio?.id) return;
    setSavingGuest(true);
    try {
      // Soft-delete: gli appuntamenti già creati restano in DB
      const { error } = await supabase
        .from("guest_practitioners")
        .update({ is_active: false })
        .eq("id", id);
      if (error) { alert("Errore disattivazione: " + error.message); return; }
      await loadGuests();
      flashSuccess("Professionista disattivato.");
    } finally {
      setSavingGuest(false);
    }
  }, [studio?.id, loadGuests]);

  // mig. 032 — Portale pubblico ospite: genera / revoca token UUID
  const [savingGuestToken, setSavingGuestToken] = useState<string | null>(null);

  const generateGuestToken = useCallback(async (id: string) => {
    if (!studio?.id) return;
    setSavingGuestToken(id);
    try {
      // Genera UUID v4 client-side (più semplice di chiamare gen_random_uuid)
      const newToken = crypto.randomUUID();
      const { error } = await supabase
        .from("guest_practitioners")
        .update({
          access_token: newToken,
          token_created_at: new Date().toISOString(),
          last_access_at: null,
        })
        .eq("id", id);
      if (error) { alert("Errore generazione link: " + error.message); return; }
      await loadGuests();
      flashSuccess("Link generato con successo. Ora puoi copiarlo e inviarlo.");
    } finally {
      setSavingGuestToken(null);
    }
  }, [studio?.id, loadGuests]);

  const revokeGuestToken = useCallback(async (id: string) => {
    if (!studio?.id) return;
    setSavingGuestToken(id);
    try {
      const { error } = await supabase
        .from("guest_practitioners")
        .update({
          access_token: null,
          token_created_at: null,
          last_access_at: null,
        })
        .eq("id", id);
      if (error) { alert("Errore revoca: " + error.message); return; }
      await loadGuests();
      flashSuccess("Link revocato. Il vecchio link non funziona più.");
    } finally {
      setSavingGuestToken(null);
    }
  }, [studio?.id, loadGuests]);

  // ── Calendar feed token ──────────────────────────────────────────────────
  const [calendarToken, setCalendarToken]                 = useState<string | null>(null);
  const [calendarTokenLoading, setCalendarTokenLoading]   = useState(true);
  const [calendarTokenRotating, setCalendarTokenRotating] = useState(false);

  useEffect(() => {
    if (!studio?.id) return;
    let cancelled = false;
    (async () => {
      setCalendarTokenLoading(true);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const accessToken = sess.session?.access_token;
        if (!accessToken) {
          if (!cancelled) setCalendarToken(null);
          return;
        }
        const r = await fetch("/api/calendar-token", {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const j = await r.json();
        if (!cancelled) setCalendarToken(r.ok ? (j.token ?? null) : null);
      } catch {
        if (!cancelled) setCalendarToken(null);
      } finally {
        if (!cancelled) setCalendarTokenLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [studio?.id]);

  const rotateCalendarToken = async () => {
    if (!confirm(
      "Sei sicuro di voler rigenerare il token?\n\n" +
      "Il vecchio URL non funzionerà più. Dovrai aggiornare l'URL anche " +
      "in Google Calendar (rimuovi il vecchio calendario e aggiungi quello nuovo)."
    )) return;
    setCalendarTokenRotating(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        alert("Sessione scaduta. Ricarica la pagina e riprova.");
        return;
      }
      const r = await fetch("/api/calendar-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const j = await r.json();
      if (r.ok && j.token) {
        setCalendarToken(j.token);
        flashSuccess("Nuovo token generato. Aggiorna l'URL in Google Calendar.");
      } else {
        alert(j.error || "Errore generazione nuovo token");
      }
    } catch {
      alert("Errore di rete. Riprova.");
    } finally {
      setCalendarTokenRotating(false);
    }
  };

  const copyCalendarLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      flashSuccess("Link copiato!");
    });
  };

  // ── Firma dinamica (passata ai TemplateEditor) ───────────────────────────
  const dynamicSignature = useMemo(
    () => [studioSignatureName, studioSignatureTitle].filter(s => s.trim()).join("\n"),
    [studioSignatureName, studioSignatureTitle]
  );

  // ═══════════════════════════════════════════════════════════════════════
  // Practice settings (anagrafica, tariffe, durate, msg automatici, gestione)
  // I campi paziente-visibili (practice_name, address, phone, googleReviewLink,
  // logo_base64) sono gestiti dalla tabella `studios` via context. Qui restano
  // solo i campi fiscali interni (titolare, P.IVA, PEC) e le preferenze utente.
  // (logoBase64 è dichiarato sopra perché usato dal callback saveStudio.)
  // ═══════════════════════════════════════════════════════════════════════
  const [defaultApptStatus, setDefaultApptStatus] = useState<"confirmed" | "booked">("confirmed");
  const [overlapMode, setOverlapMode]         = useState<"block" | "warn" | "visual">("warn");
  // Pagamenti (mig. 015)
  const [paymentMethodRequired, setPaymentMethodRequired] = useState<boolean>(true);
  const [defaultPaymentMethod,  setDefaultPaymentMethod]  = useState<"cash" | "pos" | "bank_transfer">("pos");
  const [ownerFullName, setOwnerFullName]     = useState("");
  const [vatNumber, setVatNumber]             = useState("");
  const [pecEmail, setPecEmail]               = useState("");

  // Tariffe
  const [standardInvoice, setStandardInvoice] = useState("40.00");
  const [standardCash, setStandardCash]       = useState("35.00");
  const [machineInvoice, setMachineInvoice]   = useState("25.00");
  const [machineCash, setMachineCash]         = useState("20.00");
  const [laserInvoice, setLaserInvoice]       = useState("30.00");
  const [laserCash, setLaserCash]             = useState("25.00");
  const [tecarInvoice, setTecarInvoice]       = useState("30.00");
  const [tecarCash, setTecarCash]             = useState("25.00");
  const [ondeUrtoInvoice, setOndeUrtoInvoice] = useState("40.00");
  const [ondeUrtoCash, setOndeUrtoCash]       = useState("35.00");
  const [tensInvoice, setTensInvoice]         = useState("20.00");
  const [tensCash, setTensCash]               = useState("15.00");
  const [autoApplyPrices, setAutoApplyPrices] = useState(true);

  // Durate
  const [durSeduta, setDurSeduta]       = useState("60");
  const [durMacchina, setDurMacchina]   = useState("30");
  const [durLaser, setDurLaser]         = useState("20");
  const [durTecar, setDurTecar]         = useState("30");
  const [durOndeUrto, setDurOndeUrto]   = useState("15");
  const [durTens, setDurTens]           = useState("20");

  // Messaggi automatici
  const [welcomeMsg, setWelcomeMsg]                       = useState("");
  const [bookingConfirmMsg, setBookingConfirmMsg]         = useState("");
  const [reminderMsg, setReminderMsg]                     = useState("");
  const [weeklyReminderMsg, setWeeklyReminderMsg]         = useState("");
  const [paymentMsg, setPaymentMsg]                       = useState("");
  const [birthdayMsg, setBirthdayMsg]                     = useState("");
  const [satisfactionMsg, setSatisfactionMsg]             = useState("");

  // Gestione
  const [monthlyGoal, setMonthlyGoal]       = useState("2000");
  const [inactiveThresh, setInactiveThresh] = useState("45");
  const [reminderHours, setReminderHours]   = useState("24");

  async function requireUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    const uid = data?.user?.id;
    if (!uid) throw new Error("Utente non autenticato.");
    return uid;
  }

  async function loadPracticeSettings() {
    setLoadingPractice(true);
    setError("");
    try {
      const uid = await requireUserId();
      const { data, error } = await supabase
        .from("practice_settings")
        .select("owner_id, practice_name, owner_full_name, vat_number, address, pec_email, phone, google_review_link, logo_base64, standard_invoice, standard_cash, machine_invoice, machine_cash, laser_invoice, laser_cash, tecar_invoice, tecar_cash, onde_urto_invoice, onde_urto_cash, tens_invoice, tens_cash, auto_apply_prices, reminder_message, weekly_reminder_message, payment_message, birthday_message, satisfaction_message, default_appointment_status, overlap_mode, monthly_revenue_goal, inactive_threshold_days, reminder_hours_before, welcome_message, booking_confirm_message, duration_seduta, duration_macchinario, duration_laser, duration_tecar, duration_onde_urto, duration_tens, default_group_price, default_group_max_participants, payment_method_required, default_payment_method")
        .eq("owner_id", uid)
        .maybeSingle();
      if (error) throw new Error(error.message);

      if (!data) {
        // Crea record di default e ricarica
        const { data: uData, error: uErr } = await supabase.auth.getUser();
        if (uErr) throw new Error(uErr.message);
        const u = uData?.user;
        const fullName = (
          (u?.user_metadata?.full_name ||
           u?.user_metadata?.name ||
           [u?.user_metadata?.first_name, u?.user_metadata?.last_name].filter(Boolean).join(" ") ||
           u?.email || "Titolare") + ""
        ).trim() || "Titolare";

        const seed: PracticeSettingsRow = {
          owner_id: uid, studio_id: studio?.id ?? null,
          practice_name: "FisioHub", owner_full_name: fullName,
          vat_number: "", address: "", pec_email: "", phone: "",
          google_review_link: "", logo_base64: null,
          standard_invoice: 40, standard_cash: 35,
          machine_invoice: 25, machine_cash: 20,
          laser_invoice: 30, laser_cash: 25,
          tecar_invoice: 30, tecar_cash: 25,
          onde_urto_invoice: 40, onde_urto_cash: 35,
          tens_invoice: 20, tens_cash: 15,
          duration_seduta: 60, duration_macchinario: 30,
          duration_laser: 20, duration_tecar: 30,
          duration_onde_urto: 15, duration_tens: 20,
          welcome_message: null, booking_confirm_message: null,
          reminder_message: null, weekly_reminder_message: null, payment_message: null,
          birthday_message: null, satisfaction_message: null,
          default_appointment_status: "confirmed", overlap_mode: "warn",
          payment_method_required: true, default_payment_method: "pos",
          monthly_revenue_goal: 2000, inactive_threshold_days: 45,
          reminder_hours_before: 24, auto_apply_prices: true,
        };
        const { error: upsertErr } = await supabase.from("practice_settings").upsert(seed, { onConflict: "owner_id" });
        if (upsertErr) throw new Error(upsertErr.message);
        return await loadPracticeSettings();
      }

      // Popolamento campi.
      // I campi paziente-visibili (practice_name, address, phone,
      // google_review_link, logo_base64) NON vengono più letti da qui:
      // arrivano da currentStudio (tabella studios) via context.
      setOwnerFullName(data.owner_full_name ?? "");
      setVatNumber(data.vat_number ?? "");
      setPecEmail(data.pec_email ?? "");
      setStandardInvoice(toMoneyString(data.standard_invoice, "40.00"));
      setStandardCash(toMoneyString(data.standard_cash, "35.00"));
      setMachineInvoice(toMoneyString(data.machine_invoice, "25.00"));
      setMachineCash(toMoneyString(data.machine_cash, "20.00"));
      setLaserInvoice(toMoneyString(data.laser_invoice, "30.00"));
      setLaserCash(toMoneyString(data.laser_cash, "25.00"));
      setTecarInvoice(toMoneyString(data.tecar_invoice, "30.00"));
      setTecarCash(toMoneyString(data.tecar_cash, "25.00"));
      setOndeUrtoInvoice(toMoneyString(data.onde_urto_invoice, "40.00"));
      setOndeUrtoCash(toMoneyString(data.onde_urto_cash, "35.00"));
      setTensInvoice(toMoneyString(data.tens_invoice, "20.00"));
      setTensCash(toMoneyString(data.tens_cash, "15.00"));
      setAutoApplyPrices(data.auto_apply_prices ?? true);
      // Prezzi di gruppo (mig. 014)
      setDefaultGroupPrice(toMoneyString(data.default_group_price, "15.00"));
      setDefaultGroupMaxParticipants(String(data.default_group_max_participants ?? 6));
      setDurSeduta(String(data.duration_seduta ?? 60));
      setDurMacchina(String(data.duration_macchinario ?? 30));
      setDurLaser(String(data.duration_laser ?? 20));
      setDurTecar(String(data.duration_tecar ?? 30));
      setDurOndeUrto(String(data.duration_onde_urto ?? 15));
      setDurTens(String(data.duration_tens ?? 20));
      setWelcomeMsg(data.welcome_message ?? "");
      setBookingConfirmMsg(data.booking_confirm_message ?? "");
      setReminderMsg(data.reminder_message ?? "");
      setWeeklyReminderMsg((data as PracticeSettingsRow).weekly_reminder_message ?? "");
      setPaymentMsg(data.payment_message ?? "");
      setBirthdayMsg(data.birthday_message ?? "");
      setSatisfactionMsg(data.satisfaction_message ?? "");
      setDefaultApptStatus((data.default_appointment_status ?? "confirmed") as "confirmed" | "booked");
      setOverlapMode((data.overlap_mode ?? "warn") as "block" | "warn" | "visual");
      // Pagamenti (mig. 015) — cast perché potrebbero non esistere ancora
      const dataAny = data as { payment_method_required?: boolean | null; default_payment_method?: string | null };
      setPaymentMethodRequired(dataAny.payment_method_required ?? true);
      setDefaultPaymentMethod((dataAny.default_payment_method ?? "pos") as "cash" | "pos" | "bank_transfer");
      setMonthlyGoal(String(data.monthly_revenue_goal ?? 2000));
      setInactiveThresh(String(data.inactive_threshold_days ?? 45));
      setReminderHours(String(data.reminder_hours_before ?? 24));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nel caricamento impostazioni.";
      setError(msg);
    } finally {
      setLoadingPractice(false);
    }
  }

  async function savePracticeSettings() {
    setSavingPractice(true);
    setError("");
    try {
      const uid = await requireUserId();
      // Payload contiene SOLO dati interni (fiscali) e preferenze utente.
      // I dati paziente-visibili (practice_name, address, phone, logo,
      // google_review_link) sono gestiti dalla saveStudio() su `studios`.
      const payload: PracticeSettingsRow = {
        owner_id:        uid,
        studio_id:       studio?.id ?? null,
        // I 5 campi sotto restano in PS solo come fallback storico (vincolo NOT NULL su practice_name)
        // ma non vengono più letti dal codice runtime — la verità è su studios.
        practice_name:   studio?.name || "Studio",
        logo_base64:     null,
        address:         "",
        phone:           "",
        google_review_link: "",
        // Dati fiscali (rimangono qui, non duplicati su studios)
        owner_full_name: ownerFullName.trim() || "Titolare",
        vat_number:      vatNumber.trim() || "",
        pec_email:       pecEmail.trim() || "",
        // Tariffe trattamenti (preferenze utente)
        standard_invoice:  toNumberSafe(standardInvoice, 40),
        standard_cash:     toNumberSafe(standardCash, 35),
        machine_invoice:   toNumberSafe(machineInvoice, 25),
        machine_cash:      toNumberSafe(machineCash, 20),
        laser_invoice:     toNumberSafe(laserInvoice, 30),
        laser_cash:        toNumberSafe(laserCash, 25),
        tecar_invoice:     toNumberSafe(tecarInvoice, 30),
        tecar_cash:        toNumberSafe(tecarCash, 25),
        onde_urto_invoice: toNumberSafe(ondeUrtoInvoice, 40),
        onde_urto_cash:    toNumberSafe(ondeUrtoCash, 35),
        tens_invoice:      toNumberSafe(tensInvoice, 20),
        tens_cash:         toNumberSafe(tensCash, 15),
        auto_apply_prices: autoApplyPrices,
        // Prezzi di gruppo (mig. 014)
        default_group_price:            toNumberSafe(defaultGroupPrice, 15),
        default_group_max_participants: parseInt(defaultGroupMaxParticipants) || 6,
        duration_seduta:       parseInt(durSeduta) || 60,
        duration_macchinario:  parseInt(durMacchina) || 30,
        duration_laser:        parseInt(durLaser) || 20,
        duration_tecar:        parseInt(durTecar) || 30,
        duration_onde_urto:    parseInt(durOndeUrto) || 15,
        duration_tens:         parseInt(durTens) || 20,
        welcome_message:          welcomeMsg.trim() || null,
        booking_confirm_message:  bookingConfirmMsg.trim() || null,
        reminder_message:         reminderMsg.trim() || null,
        weekly_reminder_message:  weeklyReminderMsg.trim() || null,
        payment_message:          paymentMsg.trim() || null,
        birthday_message:         birthdayMsg.trim() || null,
        satisfaction_message:     satisfactionMsg.trim() || null,
        default_appointment_status: defaultApptStatus,
        overlap_mode: overlapMode,
        // Pagamenti (mig. 015)
        payment_method_required: paymentMethodRequired,
        default_payment_method: defaultPaymentMethod,
        monthly_revenue_goal:    parseFloat(monthlyGoal) || 2000,
        inactive_threshold_days: parseInt(inactiveThresh) || 45,
        reminder_hours_before:   parseInt(reminderHours) || 24,
      };
      const { error } = await supabase.from("practice_settings").upsert(payload, { onConflict: "owner_id" });
      if (error) throw new Error(error.message);

      flashSuccess("Dati fiscali salvati.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nel salvataggio.";
      setError(msg);
    } finally {
      setSavingPractice(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Working hours
  // ═══════════════════════════════════════════════════════════════════════
  const [workingHours, setWorkingHours] = useState<WorkingHourRow[]>([]);
  const [loadingHours, setLoadingHours] = useState(true);
  const [savingHours, setSavingHours]   = useState(false);

  async function loadWorkingHours() {
    setLoadingHours(true);
    try {
      let query = supabase
        .from("working_hours")
        .select("day_of_week, open_time, close_time, is_open")
        .order("day_of_week", { ascending: true });
      // Filtro esplicito per studio se disponibile (oltre alle RLS)
      if (studio?.id) {
        query = query.eq("studio_id", studio.id);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const byDay = new Map<number, WorkingHourRow>();
      (data || []).forEach((r: WorkingHourRow) => {
        byDay.set(r.day_of_week, {
          day_of_week: r.day_of_week,
          open_time: (r.open_time || "09:00").slice(0, 5),
          close_time: (r.close_time || "19:00").slice(0, 5),
          is_open: r.is_open ?? true,
        });
      });

      const complete: WorkingHourRow[] = [];
      for (let d = 0; d < 7; d++) {
        complete.push(byDay.get(d) ?? {
          day_of_week: d, open_time: "09:00", close_time: "19:00",
          is_open: d !== 0, // Domenica chiusa di default
        });
      }
      setWorkingHours(complete);
    } catch (e) {
      console.warn("Errore caricamento orari:", e);
      const fallback: WorkingHourRow[] = [];
      for (let d = 0; d < 7; d++) {
        fallback.push({ day_of_week: d, open_time: "09:00", close_time: "19:00", is_open: d !== 0 });
      }
      setWorkingHours(fallback);
    } finally {
      setLoadingHours(false);
    }
  }

  async function saveWorkingHours() {
    setSavingHours(true);
    setError("");
    try {
      for (const r of workingHours) {
        if (r.is_open && r.open_time >= r.close_time) {
          throw new Error(`${DAY_LABELS[r.day_of_week]}: l'ora di apertura deve essere precedente alla chiusura.`);
        }
      }
      const payload = workingHours.map(r => ({
        day_of_week: r.day_of_week,
        open_time: r.open_time,
        close_time: r.close_time,
        is_open: r.is_open,
        studio_id: studio?.id ?? null,
      }));
      const { error } = await supabase
        .from("working_hours")
        .upsert(payload, { onConflict: "studio_id,day_of_week" });
      if (error) throw new Error(error.message);
      flashSuccess("Orari salvati.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nel salvataggio degli orari.";
      setError(msg);
    } finally {
      setSavingHours(false);
    }
  }

  function updateHour(day: number, patch: Partial<WorkingHourRow>) {
    setWorkingHours(prev => prev.map(r => r.day_of_week === day ? { ...r, ...patch } : r));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Templates promemoria (calendario)
  // ═══════════════════════════════════════════════════════════════════════
  const [templates, setTemplates]     = useState<MessageTemplate[]>([]);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editName, setEditName]       = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  const [newName, setNewName]         = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [addingNew, setAddingNew]     = useState(false);

  async function loadTemplates() {
    setLoadingTemplates(true);
    setError("");
    try {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      setTemplates((data as MessageTemplate[]) || []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nel caricamento dei template";
      setError(msg);
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function saveTemplate(id: string) {
    if (!editName.trim() || !editTemplate.trim()) {
      setError("Nome e template sono obbligatori"); return;
    }
    setError("");
    try {
      const { error } = await supabase
        .from("message_templates")
        .update({ name: editName.trim(), template: editTemplate.trim(), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
      flashSuccess("Template salvato.");
      setEditingId(null);
      await loadTemplates();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nel salvataggio del template";
      setError(msg);
    }
  }

  async function deleteTemplate(id: string) {
    if (templates.length <= 1) {
      setError("Non puoi eliminare l'unico template disponibile"); return;
    }
    const t = templates.find(t => t.id === id);
    if (!t) return;
    if (!confirm("Eliminare questo template? L'operazione non può essere annullata.")) return;
    setError("");
    try {
      if (t.is_default) {
        const other = templates.find(x => x.id !== id);
        if (other) {
          const { error: e1 } = await supabase
            .from("message_templates")
            .update({ is_default: true })
            .eq("id", other.id);
          if (e1) throw new Error(e1.message);
        }
      }
      const { error } = await supabase.from("message_templates").delete().eq("id", id);
      if (error) throw new Error(error.message);
      flashSuccess("Template eliminato.");
      await loadTemplates();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nell'eliminazione";
      setError(msg);
    }
  }

  async function setAsDefault(id: string) {
    setError("");
    try {
      const { error: e1 } = await supabase
        .from("message_templates")
        .update({ is_default: false })
        .neq("id", id);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase
        .from("message_templates")
        .update({ is_default: true })
        .eq("id", id);
      if (e2) throw new Error(e2.message);
      flashSuccess("Template impostato come predefinito.");
      await loadTemplates();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore";
      setError(msg);
    }
  }

  async function createNewTemplate() {
    if (!newName.trim() || !newTemplate.trim()) {
      setError("Nome e template sono obbligatori"); return;
    }
    if (!studio?.id) {
      setError("Studio non identificato. Ricarica la pagina."); return;
    }
    setError("");
    try {
      const { error } = await supabase.from("message_templates").insert({
        name: newName.trim(),
        template: newTemplate.trim(),
        is_default: templates.length === 0,
        studio_id: studio.id,
      });
      if (error) throw new Error(error.message);
      flashSuccess("Nuovo template creato.");
      setNewName(""); setNewTemplate(""); setAddingNew(false);
      await loadTemplates();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nella creazione";
      setError(msg);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Servizi prenotabili
  // ═══════════════════════════════════════════════════════════════════════
  const [services, setServices]               = useState<BookableService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [savingSvc, setSavingSvc]             = useState(false);
  const [newSvcName, setNewSvcName]           = useState("");
  const [newSvcDuration, setNewSvcDuration]   = useState("60");
  const [newSvcPrice, setNewSvcPrice]         = useState("40");

  async function loadServices() {
    setLoadingServices(true);
    try {
      const { data } = await supabase.from("booking_services").select("*").order("name");
      setServices((data as BookableService[]) || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoadingServices(false);
    }
  }

  async function addService() {
    if (!newSvcName.trim()) return;
    if (!studio?.id) {
      setError("Studio non identificato. Ricarica la pagina."); return;
    }
    setSavingSvc(true);
    try {
      const { error } = await supabase.from("booking_services").insert({
        name: newSvcName.trim(),
        duration: parseInt(newSvcDuration) || 60,
        price: parseFloat(newSvcPrice) || 40,
        studio_id: studio.id,
      });
      if (error) throw new Error(error.message);
      setNewSvcName(""); setNewSvcDuration("60"); setNewSvcPrice("40");
      await loadServices();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore";
      setError(msg);
    } finally {
      setSavingSvc(false);
    }
  }

  async function deleteService(id: string) {
    if (!confirm("Eliminare questo servizio?")) return;
    await supabase.from("booking_services").delete().eq("id", id);
    await loadServices();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Giorni di blocco
  // ═══════════════════════════════════════════════════════════════════════
  const [blockDays, setBlockDays]       = useState<BlockedDay[]>([]);
  const [savingBlock, setSavingBlock]   = useState(false);
  const [newBlockDate, setNewBlockDate] = useState("");
  const [newBlockLabel, setNewBlockLabel] = useState("");

  async function loadBlockDays() {
    try {
      const { data } = await supabase.from("blocked_days").select("*").order("date");
      setBlockDays((data as BlockedDay[]) || []);
    } catch (e) {
      console.warn(e);
    }
  }

  async function addBlockDay() {
    if (!newBlockDate) return;
    if (!studio?.id) {
      setError("Studio non identificato. Ricarica la pagina."); return;
    }
    setSavingBlock(true);
    try {
      const { error } = await supabase.from("blocked_days").insert({
        date: newBlockDate,
        label: newBlockLabel.trim() || "Chiuso",
        studio_id: studio.id,
      });
      if (error) throw new Error(error.message);
      setNewBlockDate(""); setNewBlockLabel("");
      await loadBlockDays();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore";
      setError(msg);
    } finally {
      setSavingBlock(false);
    }
  }

  async function deleteBlockDay(id: string) {
    await supabase.from("blocked_days").delete().eq("id", id);
    await loadBlockDays();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Cambio password
  // ═══════════════════════════════════════════════════════════════════════
  const [pwNew, setPwNew]         = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving]   = useState(false);
  const [pwError, setPwError]     = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  async function changePassword() {
    setPwError(""); setPwSuccess("");
    if (!pwNew.trim()) { setPwError("Inserisci la nuova password."); return; }
    if (pwNew.length < 8) { setPwError("La password deve essere di almeno 8 caratteri."); return; }
    if (pwNew !== pwConfirm) { setPwError("Le password non coincidono."); return; }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw new Error(error.message);
      setPwSuccess("Password aggiornata con successo.");
      setPwNew(""); setPwConfirm("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore aggiornamento password.";
      setPwError(msg);
    } finally {
      setPwSaving(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Backup CSV
  // ═══════════════════════════════════════════════════════════════════════
  const [exportingBackup, setExportingBackup] = useState(false);

  async function exportBackup() {
    setExportingBackup(true);
    try {
      const [{ data: pts }, { data: appts }, { data: nols }] = await Promise.all([
        supabase.from("patients").select("*").order("last_name"),
        supabase.from("appointments")
          .select("*,patients:patient_id(first_name,last_name)")
          .order("start_at", { ascending: false }),
        supabase.from("noleggios").select("*").order("created_at", { ascending: false }),
      ]);

      // Escape CSV: virgolette se contiene `;`, `"`, newline o CR
      const esc = (v: unknown): string => {
        const s = String(v ?? "");
        if (s.indexOf(";") >= 0 || s.indexOf('"') >= 0 || s.indexOf("\n") >= 0 || s.indexOf("\r") >= 0) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      const bom = "\uFEFF";

      // Pazienti
      const ptHeaders = ["ID", "Cognome", "Nome", "Telefono", "Data nascita", "Codice fiscale", "Indirizzo", "Piano fatturazione", "Creato il"];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ptRows = (pts || []).map((p: any) =>
        [p.id, p.last_name, p.first_name, p.phone, p.birth_date, p.tax_code, p.res_city, p.preferred_plan, p.created_at?.slice(0, 10)].map(esc).join(";")
      );
      const ptCsv = bom + [ptHeaders.map(esc).join(";"), ...ptRows].join("\r\n");

      // Appuntamenti
      const apHeaders = ["Data", "Ora", "Cognome", "Nome", "Stato", "Tipo", "Importo", "Pagato", "Sede", "Fatturazione"];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apRows = (appts || []).map((a: any) => {
        const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
        return [a.start_at?.slice(0, 10), a.start_at?.slice(11, 16), p?.last_name, p?.first_name, a.status, a.treatment_type, a.amount, a.is_paid ? "Si" : "No", a.clinic_site || a.location, a.price_type].map(esc).join(";");
      });
      const apCsv = bom + [apHeaders.map(esc).join(";"), ...apRows].join("\r\n");

      // Noleggi
      const nlHeaders = ["Paziente", "Dispositivo", "Data inizio", "Data fine", "Prezzo/gg", "Totale", "Pagato", "Reso"];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nlRows = (nols || []).map((n: any) =>
        [n.patient_name, n.device_name, n.start_date, n.end_date, n.price_per_day, n.total_amount, n.is_paid ? "Si" : "No", n.is_returned ? "Si" : "No"].map(esc).join(";")
      );
      const nlCsv = bom + [nlHeaders.map(esc).join(";"), ...nlRows].join("\r\n");

      const timestamp = new Date().toISOString().slice(0, 10);
      const files = [
        { data: ptCsv, name: `fisiohub_pazienti_${timestamp}.csv` },
        { data: apCsv, name: `fisiohub_appuntamenti_${timestamp}.csv` },
        { data: nlCsv, name: `fisiohub_noleggii_${timestamp}.csv` },
      ];

      files.forEach(({ data, name }) => {
        const blob = new Blob([data], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
      flashSuccess("Backup scaricato: 3 file CSV (pazienti, appuntamenti, noleggii).");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore durante il backup.";
      setError(msg);
    } finally {
      setExportingBackup(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Caricamento iniziale (al mount + cambio studio)
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    void (async () => {
      setError("");
      await Promise.all([
        loadPracticeSettings(),
        loadTemplates(),
        loadWorkingHours(),
        loadServices(),
        loadBlockDays(),
      ]);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio?.id]);

  // ═══════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg, fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif" }}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        *{-webkit-font-smoothing:antialiased;box-sizing:border-box;}
        body{font-family:'Outfit','Segoe UI',system-ui,sans-serif;margin:0;background:${THEME.appBg};}
        a{text-decoration:none;}
        select,input,textarea,button{font-family:inherit;}
        input:focus,select:focus,textarea:focus{border-color:${THEME.blue}!important;box-shadow:0 0 0 3px rgba(37,99,235,0.10)!important;outline:none!important;}
        @media(min-width:768px)and(max-width:1024px){.th{display:none!important}}
      `}</style>

      <AppNavbar active="settings" />

      <main style={{ padding: "28px 32px", maxWidth: 900, margin: "0 auto" }}>

        {/* Page title */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontWeight: 800, fontSize: 24, color: THEME.text, letterSpacing: -0.4 }}>Impostazioni</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: THEME.muted }}>Dati studio · Tariffe trattamenti · Template WhatsApp</p>
        </div>

        {/* ━━━ PIANO E ABBONAMENTO (card riepilogo) ━━━ */}
        <Link
          href="/piano"
          style={{
            display: "block",
            background: THEME.panelBg,
            border: `1px solid ${THEME.border}`,
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 20,
            textDecoration: "none",
            color: "inherit",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = THEME.teal;
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(13,148,136,0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = THEME.border;
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>
                Piano e abbonamento
              </div>
              {planLimits.loading ? (
                <div style={{ fontSize: 16, color: THEME.muted }}>Caricamento…</div>
              ) : planLimits.plan?.plan_id ? (
                <>
                  <div style={{ fontSize: 20, fontWeight: 700, color: THEME.text, letterSpacing: -0.3 }}>
                    {planLimits.plan.plan_name}
                    {planLimits.plan.price_monthly_cents ? (
                      <span style={{ fontSize: 14, fontWeight: 500, color: THEME.muted, marginLeft: 8 }}>
                        €{(planLimits.plan.price_monthly_cents / 100).toFixed(0)}/mese
                      </span>
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 500, color: THEME.muted, marginLeft: 8 }}>
                        Gratuito
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: THEME.muted, marginTop: 4 }}>
                    {planLimits.usage.patients}
                    <span style={{ color: "#94a3b8" }}>
                      /{planLimits.plan.max_patients ?? "∞"}
                    </span>{" "}
                    pazienti · {planLimits.usage.appointments_this_month}
                    <span style={{ color: "#94a3b8" }}>
                      /{planLimits.plan.max_appointments_per_month ?? "∞"}
                    </span>{" "}
                    appuntamenti/mese
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 20, fontWeight: 700, color: THEME.text, letterSpacing: -0.3 }}>
                    Nessun piano attivo
                  </div>
                  <div style={{ fontSize: 13, color: THEME.amber, marginTop: 4, fontWeight: 600 }}>
                    → Configura ora il tuo piano
                  </div>
                </>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, color: THEME.teal, fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
              Gestisci
              <span style={{ fontSize: 18 }}>→</span>
            </div>
          </div>
        </Link>

        {/* Feedback banners */}
        {error && (
          <div style={{ marginBottom: 16, padding: "11px 16px", borderRadius: 8, background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)", color: THEME.red, fontWeight: 600, fontSize: 13 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ marginBottom: 16, padding: "11px 16px", borderRadius: 8, background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.2)", color: THEME.green, fontWeight: 600, fontSize: 13 }}>
            {success}
          </div>
        )}

        {/* ─── Tab bar 4 categorie ─── */}
        <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {/* ─── Tab "Studio": StudioBranding + Practice + Prezzi + Orari ─── */}
        {activeTab === "studio" && (
          <>
            <StudioBrandingSection
              show={showStudio} onToggle={() => setShowStudio(!showStudio)}
              studioName={studioName} setStudioName={setStudioName}
              studioAddress={studioAddress} setStudioAddress={setStudioAddress}
              studioPhone={studioPhone} setStudioPhone={setStudioPhone}
              studioEmail={studioEmail} setStudioEmail={setStudioEmail}
              studioWebsite={studioWebsite} setStudioWebsite={setStudioWebsite}
              studioGoogleReview={studioGoogleReview} setStudioGoogleReview={setStudioGoogleReview}
              studioSignatureName={studioSignatureName} setStudioSignatureName={setStudioSignatureName}
              studioSignatureTitle={studioSignatureTitle} setStudioSignatureTitle={setStudioSignatureTitle}
              professionalRegisterNumber={professionalRegisterNumber} setProfessionalRegisterNumber={setProfessionalRegisterNumber}
              professionalRegisterName={professionalRegisterName} setProfessionalRegisterName={setProfessionalRegisterName}
              logoBase64={logoBase64} setLogoBase64={setLogoBase64}
              notifyEmailEnabled={notifyEmailEnabled} setNotifyEmailEnabled={setNotifyEmailEnabled}
              notifyBellEnabled={notifyBellEnabled} setNotifyBellEnabled={setNotifyBellEnabled}
              notifyWaRedirectEnabled={notifyWaRedirectEnabled} setNotifyWaRedirectEnabled={setNotifyWaRedirectEnabled}
              showBookingCardHome={showBookingCardHome} setShowBookingCardHome={setShowBookingCardHome}
              showBookingBellCalendar={showBookingBellCalendar} setShowBookingBellCalendar={setShowBookingBellCalendar}
              savingStudio={savingStudio}
              onSave={() => void saveStudio()}
            />

            <LocationsSection
              show={showLocations} onToggle={() => setShowLocations(!showLocations)}
              multiLocationEnabled={multiLocationEnabled}
              setMultiLocationEnabled={setMultiLocationEnabled}
              savingMultiToggle={savingMultiToggle}
              onSaveMultiToggle={() => void saveMultiLocationToggle()}
              locations={studioLocations as StudioLocation[]}
              loadingLocations={loadingLocations}
              savingLocation={savingLocation}
              onCreate={createLocation}
              onUpdate={updateLocation}
              onDelete={deleteLocation}
              onSetPrimary={setPrimaryLocation}
            />

            <PracticeSection
              show={showPractice} onToggle={() => setShowPractice(!showPractice)}
              loadingPractice={loadingPractice} savingPractice={savingPractice}
              ownerFullName={ownerFullName} setOwnerFullName={setOwnerFullName}
              vatNumber={vatNumber} setVatNumber={setVatNumber}
              pecEmail={pecEmail} setPecEmail={setPecEmail}
              onReload={() => void loadPracticeSettings()}
              onSave={() => void savePracticeSettings()}
            />

            <PricesSection
              show={showPrices} onToggle={() => setShowPrices(!showPrices)}
              loadingPractice={loadingPractice} savingPractice={savingPractice}
              standardInvoice={standardInvoice} setStandardInvoice={setStandardInvoice}
              standardCash={standardCash} setStandardCash={setStandardCash}
              machineInvoice={machineInvoice} setMachineInvoice={setMachineInvoice}
              machineCash={machineCash} setMachineCash={setMachineCash}
              laserInvoice={laserInvoice} setLaserInvoice={setLaserInvoice}
              laserCash={laserCash} setLaserCash={setLaserCash}
              tecarInvoice={tecarInvoice} setTecarInvoice={setTecarInvoice}
              tecarCash={tecarCash} setTecarCash={setTecarCash}
              ondeUrtoInvoice={ondeUrtoInvoice} setOndeUrtoInvoice={setOndeUrtoInvoice}
              ondeUrtoCash={ondeUrtoCash} setOndeUrtoCash={setOndeUrtoCash}
              tensInvoice={tensInvoice} setTensInvoice={setTensInvoice}
              tensCash={tensCash} setTensCash={setTensCash}
              autoApplyPrices={autoApplyPrices} setAutoApplyPrices={setAutoApplyPrices}
              defaultGroupPrice={defaultGroupPrice} setDefaultGroupPrice={setDefaultGroupPrice}
              defaultGroupMaxParticipants={defaultGroupMaxParticipants} setDefaultGroupMaxParticipants={setDefaultGroupMaxParticipants}
              groupStatsCountAsSeparate={groupStatsCountAsSeparate} setGroupStatsCountAsSeparate={setGroupStatsCountAsSeparate}
              onSaveGroupStats={() => void saveGroupStats()}
              savingStudio={savingGroupStats}
              onReload={() => void loadPracticeSettings()}
              onSave={() => void savePracticeSettings()}
            />

            <TreatmentsSection
          show={showTreatments}
          onToggle={() => setShowTreatments(!showTreatments)}
          studioId={studio?.id ?? null}
        />

        <WorkingHoursSection
          show={showHours} onToggle={() => setShowHours(!showHours)}
          loadingHours={loadingHours} savingHours={savingHours}
          workingHours={workingHours}
          onUpdateHour={updateHour}
          onReload={() => void loadWorkingHours()}
          onSave={() => void saveWorkingHours()}
        />
          </>
        )}

        {/* ─── Tab "Team": operatori + stanze ─── */}
        {activeTab === "team" && (
          <>
            <TeamSection
              show={showTeam}
              onToggle={() => setShowTeam(!showTeam)}
              studioId={studio?.id ?? ""}
              multiOperatorEnabled={multiOperatorEnabled}
              setMultiOperatorEnabled={setMultiOperatorEnabled}
              savingMultiToggle={savingMultiOpToggle}
              onSaveMultiToggle={() => void saveMultiOperatorToggle()}
              members={members}
              currentUserId={currentUserId}
              loadingMembers={loadingMembers}
              savingMember={savingMember}
              onCreateInvite={createInvite}
              onUpdateMember={updateMember}
              onDeleteMember={deleteMember}
              weeklyViewLayout={weeklyViewLayout}
              setWeeklyViewLayout={setWeeklyViewLayout}
              savingWeeklyLayout={savingWeeklyLayout}
              onSaveWeeklyLayout={() => void saveWeeklyLayout()}
              defaultCalendarView={defaultCalendarView}
              setDefaultCalendarView={setDefaultCalendarView}
              savingDefaultCalendarView={savingDefaultCalendarView}
              onSaveDefaultCalendarView={() => void saveDefaultCalendarView()}
            />

            <RoomsSection
              show={showRooms}
              onToggle={() => setShowRooms(!showRooms)}
              multiRoomEnabled={multiRoomEnabled}
              setMultiRoomEnabled={setMultiRoomEnabled}
              savingMultiToggle={savingMultiRoomToggle}
              onSaveMultiToggle={() => void saveMultiRoomToggle()}
              rooms={rooms}
              locations={studioLocations as StudioLocation[]}
              treatments={allTreatments}
              loadingRooms={loadingRooms}
              savingRoom={savingRoom}
              onCreate={createRoom}
              onUpdate={updateRoom}
              onDelete={deleteRoom}
            />

            {/* Sezione Professionisti ospiti (mig. 029). Sempre visibile nella
                tab Team. Il toggle interno alla sezione governa la feature. */}
            <GuestPractitionersSection
              show={showGuests}
              onToggle={() => setShowGuests(!showGuests)}
              guestEnabled={guestEnabled}
              setGuestEnabled={setGuestEnabled}
              savingGuestToggle={savingGuestToggle}
              onSaveGuestToggle={() => void saveGuestToggle()}
              guests={guests}
              rooms={rooms}
              loadingGuests={loadingGuests}
              savingGuest={savingGuest}
              onCreate={createGuest}
              onUpdate={updateGuest}
              onDelete={deleteGuest}
              useGuestIndex={useGuestIndex}
              setUseGuestIndex={setUseGuestIndex}
              savingGuestIndexToggle={savingGuestIndexToggle}
              onSaveGuestIndexToggle={saveGuestIndexToggle}
              onGenerateGuestToken={generateGuestToken}
              onRevokeGuestToken={revokeGuestToken}
              savingGuestToken={savingGuestToken}
            />

            {/* Sezione assenze operatori (Fase 5). Visibile solo se multi-op
                attivo e ≥2 membri. Le assenze appariranno nel calendario. */}
            {multiOperatorEnabled && members.filter(m => m.is_active !== false).length >= 2 && studio?.id && (
              <OperatorAbsencesSection
                show={showAbsences}
                onToggle={() => setShowAbsences(!showAbsences)}
                studioId={studio.id}
                members={members.filter(m => m.is_active !== false)}
              />
            )}
          </>
        )}

        {/* ─── Tab "Calendario": Durate + CalendarPrefs + Servizi + Giorni bloccati ─── */}
        {activeTab === "calendar" && (
          <>
            <CalendarPrefsSection
              savingPractice={savingPractice}
              defaultApptStatus={defaultApptStatus} setDefaultApptStatus={setDefaultApptStatus}
              overlapMode={overlapMode} setOverlapMode={setOverlapMode}
              paymentMethodRequired={paymentMethodRequired}
              setPaymentMethodRequired={setPaymentMethodRequired}
              defaultPaymentMethod={defaultPaymentMethod}
              setDefaultPaymentMethod={setDefaultPaymentMethod}
              onSave={() => void savePracticeSettings()}
            />

            <BookableServicesSection
              show={showServices} onToggle={() => setShowServices(!showServices)}
              loadingServices={loadingServices} savingSvc={savingSvc}
              services={services}
              newSvcName={newSvcName} setNewSvcName={setNewSvcName}
              newSvcDuration={newSvcDuration} setNewSvcDuration={setNewSvcDuration}
              newSvcPrice={newSvcPrice} setNewSvcPrice={setNewSvcPrice}
              onAdd={() => void addService()}
              onDelete={(id) => void deleteService(id)}
            />

            <BlockedDaysSection
              show={showBlockDays} onToggle={() => setShowBlockDays(!showBlockDays)}
              savingBlock={savingBlock} blockDays={blockDays}
              newBlockDate={newBlockDate} setNewBlockDate={setNewBlockDate}
              newBlockLabel={newBlockLabel} setNewBlockLabel={setNewBlockLabel}
              onAdd={() => void addBlockDay()}
              onDelete={(id) => void deleteBlockDay(id)}
            />
          </>
        )}

        {/* ─── Tab "Comunicazioni": Templates messaggi + Integrazioni ─── */}
        {activeTab === "communications" && (
          <>
            <TemplatesSection
              show={showTemplates} onToggle={() => setShowTemplates(!showTemplates)}
              loadingTemplates={loadingTemplates} savingPractice={savingPractice}
              templates={templates} dynamicSignature={dynamicSignature}
              editingId={editingId} setEditingId={setEditingId}
              editName={editName} setEditName={setEditName}
              editTemplate={editTemplate} setEditTemplate={setEditTemplate}
              newName={newName} setNewName={setNewName}
              newTemplate={newTemplate} setNewTemplate={setNewTemplate}
              addingNew={addingNew} setAddingNew={setAddingNew}
              onSaveTemplate={(id) => void saveTemplate(id)}
              onDeleteTemplate={(id) => void deleteTemplate(id)}
              onSetAsDefault={(id) => void setAsDefault(id)}
              onCreateNewTemplate={() => void createNewTemplate()}
              welcomeMsg={welcomeMsg} setWelcomeMsg={setWelcomeMsg}
              bookingConfirmMsg={bookingConfirmMsg} setBookingConfirmMsg={setBookingConfirmMsg}
              reminderMsg={reminderMsg} setReminderMsg={setReminderMsg}
              weeklyReminderMsg={weeklyReminderMsg} setWeeklyReminderMsg={setWeeklyReminderMsg}
              paymentMsg={paymentMsg} setPaymentMsg={setPaymentMsg}
              birthdayMsg={birthdayMsg} setBirthdayMsg={setBirthdayMsg}
              satisfactionMsg={satisfactionMsg} setSatisfactionMsg={setSatisfactionMsg}
              onSaveAutoMessages={() => void savePracticeSettings()}
            />

            <IntegrationsSection
              show={showBackup} onToggle={() => setShowBackup(!showBackup)}
              exportingBackup={exportingBackup} onExportBackup={() => void exportBackup()}
              calendarToken={calendarToken}
              calendarTokenLoading={calendarTokenLoading}
              calendarTokenRotating={calendarTokenRotating}
              onRotateToken={rotateCalendarToken}
              onCopyLink={copyCalendarLink}
            />
          </>
        )}

        {/* ─── Tab "Account": Password + Gestione ─── */}
        {activeTab === "account" && (
          <>
            <PasswordSection
              show={showPassword} onToggle={() => setShowPassword(!showPassword)}
              pwSaving={pwSaving} pwError={pwError} pwSuccess={pwSuccess}
              pwNew={pwNew} setPwNew={setPwNew}
              pwConfirm={pwConfirm} setPwConfirm={setPwConfirm}
              onChange={() => void changePassword()}
            />

            <ManagementSection
              show={showGestione} onToggle={() => setShowGestione(!showGestione)}
              savingPractice={savingPractice}
              monthlyGoal={monthlyGoal} setMonthlyGoal={setMonthlyGoal}
              inactiveThresh={inactiveThresh} setInactiveThresh={setInactiveThresh}
              reminderHours={reminderHours} setReminderHours={setReminderHours}
              onSave={() => void savePracticeSettings()}
            />
          </>
        )}

        <div style={{ textAlign: "center", fontSize: 12, color: THEME.muted, padding: "8px 0 16px" }}>
          FisioHub · {new Date().getFullYear()}
        </div>
      </main>
    </div>
  );
}
