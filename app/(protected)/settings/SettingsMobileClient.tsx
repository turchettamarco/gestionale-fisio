"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { usePrivacyMode, type PrivacyStyle } from "@/src/contexts/PrivacyModeContext";
import { showToast } from "@/src/components/mobile/ToastProvider";
import SettingsSearch, { type SettingsSearchItem } from "./components/SettingsSearch";
import { toMoneyString } from "./components/shared/utils";
import type { MessageTemplate, BookableService, BlockedDay, StudioMemberRow, StudioRoomRow, PracticeSettingsRow, StudioLocation } from "./components/shared/types";
import AgendaViewPrefsSection from "./components/sections/AgendaViewPrefsSection";
import CalendarPrefsSection from "./components/sections/CalendarPrefsSection";
import BlockedDaysSection from "./components/sections/BlockedDaysSection";
import BookableServicesSection from "./components/sections/BookableServicesSection";
import TeamSection from "./components/sections/TeamSection";
import RoomsSection from "./components/sections/RoomsSection";
import OperatorAbsencesSection from "./components/sections/OperatorAbsencesSection";
import TemplatesSection from "./components/sections/TemplatesSection";
import IntegrationsSection from "./components/sections/IntegrationsSection";
import PracticeSection from "./components/sections/PracticeSection";
import AccountingSection from "./components/sections/AccountingSection";
import ManagementSection from "./components/sections/ManagementSection";
import {
  type TreatmentTypeRow,
  loadTreatmentTypes,
  keyFromLabel,
} from "@/src/lib/treatmentTypes";
import GuestEditModalMobile, { type GuestEditRow } from "@/src/components/mobile/GuestEditModalMobile";
import { ToastProvider } from "@/src/components/mobile/ToastProvider";
import MobileTabBar from "@/src/components/MobileTabBar";

const THEME = {
  appBg:"#FAF7F2", panelBg:"#ffffff", panelSoft:"#FFFDF9", text:"#1A1D24", muted:"#6B6455",
  border:"#E0D8C8", blue:"#2563eb", teal:"#0d9488", green:"#16a34a",
  red:"#dc2626", amber:"#f97316", gray:"#A9A092",
  gradient:"linear-gradient(135deg,#0d9488,#2563eb)",
};

// ─── Palette colori (stessa del desktop) ─────────────────────────────────
const COLOR_PALETTE: { value: string; name: string }[] = [
  { value: "#0d9488", name: "Teal" },
  { value: "#2563eb", name: "Blu" },
  { value: "#d97706", name: "Ambra" },
  { value: "#ea580c", name: "Arancio" },
  { value: "#7c3aed", name: "Viola" },
  { value: "#059669", name: "Verde" },
  { value: "#db2777", name: "Rosa" },
  { value: "#4f46e5", name: "Indaco" },
  { value: "#dc2626", name: "Rosso" },
  { value: "#475569", name: "Grigio" },
];

const DAY_LABELS = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
const DAY_ORDER = [1,2,3,4,5,6,0];

export default function SettingsMobileClient() {
  const router = useRouter();
  const { studio: currentStudio, refresh: refreshStudio, locations: studioLocations, refreshLocations } = useCurrentStudio();
  const { privacyMode, setPrivacyMode, privacyStyle, setPrivacyStyle, hydrated: privacyHydrated } = usePrivacyMode();
  const currentStudioId = currentStudio?.id ?? null;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeSection, setActiveSection] = useState<string|null>(null);

  // ── Practice ──
  const [practiceName, setPracticeName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [googleReviewLink, setGoogleReviewLink] = useState("");
  // Firma usata nei messaggi WhatsApp/promemoria (multi-tenancy)
  const [signatureName, setSignatureName] = useState("");
  const [signatureTitle, setSignatureTitle] = useState("");
  // Iscrizione albo professionale (mig. 034) — per attestati di presenza
  const [professionalRegisterNumber, setProfessionalRegisterNumber] = useState("");
  const [professionalRegisterName, setProfessionalRegisterName]     = useState("TSRM-PSTRP");
  // Logo studio (multi-tenancy: salvato su studios.logo_base64)
  const [logoBase64, setLogoBase64] = useState("");
  // Dati fiscali (interni, su practice_settings)
  const [vatNumber, setVatNumber] = useState("");
  const [pecEmail, setPecEmail] = useState("");
  // Notifiche (Fase N2)
  const [notifyEmailEnabled, setNotifyEmailEnabled] = useState(true);
  const [notifyBellEnabled, setNotifyBellEnabled] = useState(true);
  const [notifyWaRedirectEnabled, setNotifyWaRedirectEnabled] = useState(true);
  // Report automatici (mig. 039/040)
  const [reportMonthlyEnabled, setReportMonthlyEnabled] = useState(true);
  const [reportQuarterlyEnabled, setReportQuarterlyEnabled] = useState(false);
  const [reportYearlyEnabled, setReportYearlyEnabled] = useState(false);
  const [reportEmail, setReportEmail] = useState("");
  const [savingReport, setSavingReport] = useState(false);
  // UI legacy Prenotazioni dal sito (Fase N2.1)
  const [showBookingCardHome, setShowBookingCardHome] = useState(false);
  const [showBookingBellCalendar, setShowBookingBellCalendar] = useState(false);

  // ── Multi-sede (mig. 014) ──
  const [multiLocationEnabled, setMultiLocationEnabled] = useState(false);
  const [savingMultiToggle, setSavingMultiToggle] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [showAddLocForm, setShowAddLocForm] = useState(false);
  const [locFormName, setLocFormName] = useState("");
  const [locFormAddress, setLocFormAddress] = useState("");
  const [locFormBorderColor, setLocFormBorderColor] = useState<string>("#2563eb");
  // Palette 6 preset multi-sede (combacia col desktop)
  const LOC_BORDER_PRESETS: { value: string; label: string }[] = [
    { value: "#2563eb", label: "Blu" },
    { value: "#dc2626", label: "Rosso" },
    { value: "#16a34a", label: "Verde" },
    { value: "#f97316", label: "Arancio" },
    { value: "#7c3aed", label: "Viola" },
    { value: "#0d9488", label: "Teal" },
  ];

  // ── Catalogo Trattamenti (sostituisce le vecchie tariffe + durate) ──
  const [treatments, setTreatments] = useState<TreatmentTypeRow[]>([]);
  const [loadingTreatments, setLoadingTreatments] = useState(false);
  const [savingTreatment, setSavingTreatment] = useState(false);
  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<{
    id: string | null;
    label: string;
    color: string;
    priceInvoice: string;
    priceCash: string;
    durationMin: string;
    isActive: boolean;
    isBuiltin: boolean;
  } | null>(null);

  // ── Working hours ──
  const [hours, setHours] = useState<{day_of_week:number;open_time:string;close_time:string;is_open:boolean}[]>([]);

  // ── Professionisti ospiti (mig. 029-033) ──────────────────────────────
  type GuestRow = {
    id: string; first_name: string; last_name: string; specialty: string;
    display_color: string | null; default_room_id: string | null;
    notes: string | null; is_active: boolean; sort_order: number;
    pdf_print_fields: {
      telefono?: boolean; durata?: boolean; diagnosi?: boolean; note?: boolean;
    };
    access_token: string | null;
    token_created_at: string | null;
    last_access_at: string | null;
    phone: string | null;
    email: string | null;
  };
  const [guestEnabled, setGuestEnabled] = useState(false);
  const [savingGuestToggle, setSavingGuestToggle] = useState(false);
  const [convEnabled, setConvEnabled] = useState(false);
  const [savingConv, setSavingConv] = useState(false);
  const [useGuestIndex, setUseGuestIndex] = useState(false);
  const [savingGuestIndexToggle, setSavingGuestIndexToggle] = useState(false);
  const [guestsList, setGuestsList] = useState<GuestRow[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(false);
  const [showNewGuestForm, setShowNewGuestForm] = useState(false);
  const [newGuestFirstName, setNewGuestFirstName] = useState("");
  const [newGuestLastName, setNewGuestLastName] = useState("");
  const [newGuestSpecialty, setNewGuestSpecialty] = useState("");
  const [newGuestColor, setNewGuestColor] = useState("#DB2777");
  const [savingNewGuest, setSavingNewGuest] = useState(false);
  // Modale modifica ospite (full-screen)
  const [editingGuest, setEditingGuest] = useState<GuestRow | null>(null);
  // Modale disattivazione ospite con scelta sugli appuntamenti collegati
  const [guestDeactivateTarget, setGuestDeactivateTarget] = useState<{ guest: GuestRow; count: number } | null>(null);
  const [deactivatingGuest, setDeactivatingGuest] = useState(false);
  // Palette colori per ospiti (allineata desktop)
  const GUEST_COLOR_PRESETS: { value: string; name: string }[] = [
    { value: "#DB2777", name: "Magenta" },
    { value: "#7C3AED", name: "Viola" },
    { value: "#0EA5E9", name: "Azzurro" },
    { value: "#F59E0B", name: "Ambra" },
    { value: "#14B8A6", name: "Turchese" },
    { value: "#EF4444", name: "Rosso" },
  ];

  // ── Goals ──
  const [monthlyGoal, setMonthlyGoal] = useState("2000");
  const [inactiveThresh, setInactiveThresh] = useState("45");
  const [overlapMode, setOverlapMode] = useState<"block"|"warn"|"visual">("warn");
  // Pagamenti (mig. 015)
  const [paymentMethodRequired, setPaymentMethodRequired] = useState<boolean>(true);
  const [defaultPaymentMethod,  setDefaultPaymentMethod]  = useState<"cash"|"pos"|"bank_transfer">("pos");

  // ── Password ──
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  // ── Load: campi STUDIO da currentStudio (context, multi-tenancy)
  //         e dati fiscali/preferenze utente da practice_settings ──
  useEffect(()=>{
    // 1. Campi visibili al paziente (nome, indirizzo, firma, logo...) ← studios
    if (currentStudio) {
      setPracticeName(currentStudio.name || "");
      setPhone(currentStudio.phone || "");
      setAddress(currentStudio.address || "");
      setEmail(currentStudio.email || "");
      setWebsite(currentStudio.website || "");
      setGoogleReviewLink(currentStudio.google_review_link || "");
      setSignatureName(currentStudio.signature_name || "");
      setSignatureTitle(currentStudio.signature_title || "");
      // Iscrizione albo (mig. 034)
      setProfessionalRegisterNumber(
        ((currentStudio as unknown as { professional_register_number?: string | null })
          .professional_register_number) || ""
      );
      setProfessionalRegisterName(
        ((currentStudio as unknown as { professional_register_name?: string | null })
          .professional_register_name) || "TSRM-PSTRP"
      );
      setLogoBase64(currentStudio.logo_base64 || "");
      // Notifiche (Fase N2)
      setNotifyEmailEnabled(currentStudio.notify_email_enabled ?? true);
      setNotifyBellEnabled(currentStudio.notify_bell_enabled ?? true);
      setNotifyWaRedirectEnabled(currentStudio.notify_wa_redirect_enabled ?? true);
      setReportMonthlyEnabled(currentStudio.report_monthly_enabled ?? true);
      setReportQuarterlyEnabled(currentStudio.report_quarterly_enabled ?? false);
      setReportYearlyEnabled(currentStudio.report_yearly_enabled ?? false);
      setReportEmail(currentStudio.report_email ?? "");
      // UI legacy Prenotazioni dal sito (Fase N2.1)
      setShowBookingCardHome(currentStudio.show_booking_card_home ?? false);
      setShowBookingBellCalendar(currentStudio.show_booking_bell_calendar ?? false);
      // Multi-sede (mig. 014)
      setMultiLocationEnabled(currentStudio.multi_location_enabled ?? false);
      // Professionisti ospiti (mig. 029, 031)
      setGuestEnabled(Boolean((currentStudio as { guest_practitioners_enabled?: boolean }).guest_practitioners_enabled));
      setConvEnabled(Boolean((currentStudio as { convenzioni_enabled?: boolean }).convenzioni_enabled));
      setUseGuestIndex(Boolean((currentStudio as { use_guest_index_page?: boolean }).use_guest_index_page));
    }
  },[currentStudio]);

// (load fiscale/preferenze parziale rimossa: ora copre tutto loadPracticeFull)


  // ── Load working_hours dello studio corrente (filtrati esplicitamente) ──
  useEffect(() => {
    if (!currentStudioId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: wh } = await supabase
          .from("working_hours")
          .select("*")
          .eq("studio_id", currentStudioId)
          .order("day_of_week");
        if (cancelled) return;
        if (wh && wh.length) {
          setHours(wh.map((r:any)=>({day_of_week:r.day_of_week,open_time:(r.open_time||"09:00").slice(0,5),close_time:(r.close_time||"19:00").slice(0,5),is_open:r.is_open??true})));
        } else {
          // Studio nuovo senza orari → defaults
          setHours(Array.from({length:7},(_,d)=>({day_of_week:d,open_time:"09:00",close_time:"19:00",is_open:d!==0})));
        }
      } catch(e:any){ setError(e?.message||"Errore caricamento orari"); }
    })();
    return () => { cancelled = true; };
  },[currentStudioId]);

  // ── Carica catalogo trattamenti per lo studio corrente ──
  const reloadTreatments = useCallback(async () => {
    if (!currentStudioId) return;
    setLoadingTreatments(true);
    try {
      const rows = await loadTreatmentTypes(currentStudioId, false);
      setTreatments(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore caricamento trattamenti.";
      setError(msg);
    } finally {
      setLoadingTreatments(false);
    }
  }, [currentStudioId]);

  useEffect(() => { void reloadTreatments(); }, [reloadTreatments]);

  // ── Multi-sede (mig. 014) handlers ─────────────────────────────────────
  async function saveMultiToggle() {
    if (!currentStudioId) { setError("Studio non disponibile"); return; }
    setSavingMultiToggle(true); setError(""); setSuccess("");
    try {
      const { error: errUpd } = await supabase
        .from("studios")
        .update({ multi_location_enabled: multiLocationEnabled })
        .eq("id", currentStudioId);
      if (errUpd) { setError("Errore: " + errUpd.message); return; }
      await refreshStudio();
      setSuccess(multiLocationEnabled ? "Multi-sede attivato." : "Multi-sede disattivato.");
      setTimeout(()=>setSuccess(""), 3000);
    } finally {
      setSavingMultiToggle(false);
    }
  }

  // ── Professionisti ospiti: load + handler ────────────────────────────
  const loadGuests = useCallback(async () => {
    if (!currentStudioId) return;
    setLoadingGuests(true);
    try {
      const { data, error: err } = await supabase
        .from("guest_practitioners")
        .select("id, first_name, last_name, specialty, display_color, default_room_id, notes, is_active, sort_order, pdf_print_fields, access_token, token_created_at, last_access_at, phone, email")
        .eq("studio_id", currentStudioId)
        .order("sort_order", { ascending: true })
        .order("last_name", { ascending: true });
      if (err) { console.error(err); setGuestsList([]); return; }
      setGuestsList((data ?? []) as GuestRow[]);
    } finally {
      setLoadingGuests(false);
    }
  }, [currentStudioId]);

  useEffect(() => {
    if (guestEnabled && currentStudioId) void loadGuests();
  }, [guestEnabled, currentStudioId, loadGuests]);

  async function saveReportSettings() {
    if (!currentStudioId) return;
    setSavingReport(true); setError(""); setSuccess("");
    try {
      const { error: err } = await supabase
        .from("studios")
        .update({
          report_monthly_enabled: reportMonthlyEnabled,
          report_quarterly_enabled: reportQuarterlyEnabled,
          report_yearly_enabled: reportYearlyEnabled,
          report_email: reportEmail.trim() || null,
        })
        .eq("id", currentStudioId);
      if (err) { setError("Errore: " + err.message); return; }
      await refreshStudio();
      setSuccess("Impostazioni report salvate.");
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSavingReport(false);
    }
  }

  // Modulo convenzioni (mig. 065)
  async function saveConvToggle() {
    if (!currentStudioId) return;
    setSavingConv(true); setError(""); setSuccess("");
    try {
      const { error: err } = await supabase
        .from("studios")
        .update({ convenzioni_enabled: convEnabled })
        .eq("id", currentStudioId);
      if (err) { setError("Errore: " + err.message); return; }
      await refreshStudio();
      setSuccess(convEnabled ? "Modulo convenzioni attivato." : "Modulo convenzioni disattivato.");
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSavingConv(false);
    }
  }

  async function saveGuestToggle() {
    if (!currentStudioId) return;
    setSavingGuestToggle(true); setError(""); setSuccess("");
    try {
      const { error: err } = await supabase
        .from("studios")
        .update({ guest_practitioners_enabled: guestEnabled })
        .eq("id", currentStudioId);
      if (err) { setError("Errore: " + err.message); return; }
      await refreshStudio();
      setSuccess(guestEnabled ? "Professionisti ospiti attivati." : "Professionisti ospiti disattivati.");
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSavingGuestToggle(false);
    }
  }

  async function saveGuestIndexToggle() {
    if (!currentStudioId) return;
    setSavingGuestIndexToggle(true); setError(""); setSuccess("");
    try {
      const { error: err } = await supabase
        .from("studios")
        .update({ use_guest_index_page: useGuestIndex })
        .eq("id", currentStudioId);
      if (err) { setError("Errore: " + err.message); return; }
      await refreshStudio();
      setSuccess(useGuestIndex ? "Pagina indice ospiti attivata." : "Pagina indice ospiti disattivata.");
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSavingGuestIndexToggle(false);
    }
  }

  function resetNewGuestForm() {
    setNewGuestFirstName("");
    setNewGuestLastName("");
    setNewGuestSpecialty("");
    setNewGuestColor("#DB2777");
    setShowNewGuestForm(false);
  }

  async function createNewGuest() {
    if (!currentStudioId) return;
    if (!newGuestFirstName.trim() || !newGuestLastName.trim() || !newGuestSpecialty.trim()) {
      setError("Nome, cognome e specialità sono obbligatori.");
      return;
    }
    setSavingNewGuest(true); setError(""); setSuccess("");
    try {
      const maxSort = guestsList.reduce((m, g) => Math.max(m, g.sort_order ?? 0), 0);
      const { error: err } = await supabase.from("guest_practitioners").insert({
        studio_id: currentStudioId,
        first_name: newGuestFirstName.trim(),
        last_name: newGuestLastName.trim(),
        specialty: newGuestSpecialty.trim(),
        display_color: newGuestColor,
        is_active: true,
        sort_order: maxSort + 1,
      });
      if (err) { setError("Errore: " + err.message); return; }
      resetNewGuestForm();
      await loadGuests();
      setSuccess("Professionista ospite aggiunto.");
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSavingNewGuest(false);
    }
  }

  async function toggleGuestActive(g: GuestRow) {
    if (!currentStudioId) return;
    // Riattivazione: nessuna domanda, toggle diretto.
    if (!g.is_active) {
      const { error: err } = await supabase
        .from("guest_practitioners")
        .update({ is_active: true })
        .eq("id", g.id);
      if (err) { setError("Errore: " + err.message); return; }
      await loadGuests();
      setSuccess("Ospite attivato.");
      setTimeout(() => setSuccess(""), 2500);
      return;
    }
    // Disattivazione: conta gli appuntamenti collegati per offrire la scelta.
    const { count } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("guest_practitioner_id", g.id)
      .eq("studio_id", currentStudioId);
    const n = count ?? 0;
    if (n === 0) {
      await doDeactivateGuest(g, false);
      return;
    }
    setGuestDeactivateTarget({ guest: g, count: n });
  }

  // Disattiva un ospite, eventualmente eliminando prima gli appuntamenti
  // collegati (altrimenti, con FK ON DELETE SET NULL, resterebbero orfani).
  async function doDeactivateGuest(g: GuestRow, deleteAppointments: boolean) {
    if (!currentStudioId) return;
    setDeactivatingGuest(true);
    try {
      if (deleteAppointments) {
        const del = await supabase
          .from("appointments")
          .delete()
          .eq("guest_practitioner_id", g.id)
          .eq("studio_id", currentStudioId);
        if (del.error) { setError("Errore eliminazione appuntamenti: " + del.error.message); return; }
      }
      const { error: err } = await supabase
        .from("guest_practitioners")
        .update({ is_active: false })
        .eq("id", g.id);
      if (err) { setError("Errore: " + err.message); return; }
      await loadGuests();
      setSuccess(deleteAppointments ? "Ospite disattivato e appuntamenti eliminati." : "Ospite disattivato.");
      setTimeout(() => setSuccess(""), 2500);
      setGuestDeactivateTarget(null);
    } finally {
      setDeactivatingGuest(false);
    }
  }

  function resetLocForm() {
    setLocFormName("");
    setLocFormAddress("");
    setLocFormBorderColor("#2563eb");
    setShowAddLocForm(false);
    setEditingLocId(null);
  }

  async function createLoc() {
    if (!currentStudioId) return;
    if (!locFormName.trim()) { showToast.warning("Il nome della sede è obbligatorio"); return; }
    setSavingLocation(true);
    try {
      const maxSort = studioLocations.reduce((m, l) => Math.max(m, l.sort_order ?? 0), 0);
      const { error: errIns } = await supabase.from("studio_locations").insert({
        studio_id: currentStudioId,
        name: locFormName.trim(),
        address: locFormAddress.trim() || null,
        is_primary: studioLocations.length === 0,
        border_color: locFormBorderColor,
        sort_order: maxSort + 1,
      });
      if (errIns) { showToast.error("Errore: " + errIns.message); return; }
      await refreshLocations();
      resetLocForm();
      setSuccess("Sede aggiunta."); setTimeout(()=>setSuccess(""), 3000);
    } finally {
      setSavingLocation(false);
    }
  }

  async function updateLoc(id: string) {
    if (!currentStudioId) return;
    if (!locFormName.trim()) { showToast.warning("Il nome della sede è obbligatorio"); return; }
    setSavingLocation(true);
    try {
      const { error: errUpd } = await supabase.from("studio_locations").update({
        name: locFormName.trim(),
        address: locFormAddress.trim() || null,
        border_color: locFormBorderColor,
      }).eq("id", id);
      if (errUpd) { showToast.error("Errore: " + errUpd.message); return; }
      await refreshLocations();
      resetLocForm();
      setSuccess("Sede aggiornata."); setTimeout(()=>setSuccess(""), 3000);
    } finally {
      setSavingLocation(false);
    }
  }

  async function deleteLoc(id: string, name: string, isPrimary: boolean) {
    if (isPrimary) { showToast.warning("Non puoi rimuovere la sede principale."); return; }
    const ok = confirm(`Rimuovere la sede "${name}"?`);
    if (!ok) return;
    setSavingLocation(true);
    try {
      const { error: errDel } = await supabase.from("studio_locations").delete().eq("id", id);
      if (errDel) { showToast.error("Errore: " + errDel.message); return; }
      await refreshLocations();
      setSuccess("Sede rimossa."); setTimeout(()=>setSuccess(""), 3000);
    } finally {
      setSavingLocation(false);
    }
  }

  async function setPrimaryLoc(id: string) {
    if (!currentStudioId) return;
    setSavingLocation(true);
    try {
      const { error: errOff } = await supabase
        .from("studio_locations")
        .update({ is_primary: false })
        .eq("studio_id", currentStudioId);
      if (errOff) { showToast.error("Errore: " + errOff.message); return; }

      const { error: errOn } = await supabase
        .from("studio_locations")
        .update({ is_primary: true, border_color: null })
        .eq("id", id);
      if (errOn) { showToast.error("Errore: " + errOn.message); return; }

      await refreshLocations();
      setSuccess("Sede principale aggiornata."); setTimeout(()=>setSuccess(""), 3000);
    } finally {
      setSavingLocation(false);
    }
  }

  function startEditLoc(loc: { id: string; name: string; address: string | null; border_color: string | null }) {
    setEditingLocId(loc.id);
    setLocFormName(loc.name);
    setLocFormAddress(loc.address ?? "");
    setLocFormBorderColor(loc.border_color ?? "#2563eb");
    setShowAddLocForm(false);
  }

  async function save() {
    setSaving(true); setError(""); setSuccess("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      if (!currentStudioId) throw new Error("Studio non disponibile");

      // 1. Dati STUDIO (visibili nei messaggi WA, fatture, sito) → studios
      const { error: studioErr } = await supabase.from("studios").update({
        name:               practiceName.trim() || null,
        phone:              phone.trim() || null,
        address:            address.trim() || null,
        email:              email.trim() || null,
        website:            website.trim() || null,
        google_review_link: googleReviewLink.trim() || null,
        signature_name:     signatureName.trim() || null,
        signature_title:    signatureTitle.trim() || null,
        // Iscrizione albo (mig. 034)
        professional_register_number: professionalRegisterNumber.trim() || null,
        professional_register_name:   professionalRegisterName.trim() || "TSRM-PSTRP",
        logo_base64:        logoBase64 || null,
        // Notifiche (Fase N2)
        notify_email_enabled:        notifyEmailEnabled,
        notify_bell_enabled:         notifyBellEnabled,
        notify_wa_redirect_enabled:  notifyWaRedirectEnabled,
        // UI legacy Prenotazioni dal sito (Fase N2.1)
        show_booking_card_home:      showBookingCardHome,
        show_booking_bell_calendar:  showBookingBellCalendar,
      }).eq("id", currentStudioId);
      if (studioErr) throw new Error("Errore salvataggio studio: " + studioErr.message);

      // 2. Dati fiscali + preferenze utente → practice_settings
      //    (NOT NULL su practice_name → riempito col nome studio per backward compat)
      const { error: psErr } = await supabase.from("practice_settings").upsert({
        owner_id: user.id,
        practice_name: practiceName.trim() || "Studio",
        owner_full_name: ownerName,
        vat_number: vatNumber.trim() || "",
        pec_email: pecEmail.trim() || "",
        monthly_revenue_goal: parseFloat(monthlyGoal)||2000,
        inactive_threshold_days: parseInt(inactiveThresh)||45,
        overlap_mode: overlapMode,
        // Pagamenti (mig. 015)
        payment_method_required: paymentMethodRequired,
        default_payment_method: defaultPaymentMethod,
      },{ onConflict:"owner_id" });
      if (psErr) throw new Error("Errore salvataggio preferenze: " + psErr.message);

      // 3. Working hours (per studio)
      if (hours.length) {
        await supabase.from("working_hours").upsert(
          hours.map(h=>({day_of_week:h.day_of_week,open_time:h.open_time,close_time:h.close_time,is_open:h.is_open,studio_id:currentStudioId})),
          { onConflict:"studio_id,day_of_week" }
        );
      }

      // 4. Refresh del context studio così tutta l'app vede i nuovi valori
      //    (incluso indirizzo nei messaggi WhatsApp, logo nei PDF/portale)
      await refreshStudio();

      setSuccess("Impostazioni salvate.");
      setTimeout(()=>setSuccess(""),3000);
    } catch(e:any){ setError(e?.message||"Errore salvataggio"); }
    finally { setSaving(false); }
  }

  // ─── Catalogo Trattamenti: handlers ──────────────────────────────────
  function openNewTreatment() {
    setEditingTreatment({
      id: null,
      label: "",
      color: COLOR_PALETTE[0].value,
      priceInvoice: "",
      priceCash: "",
      durationMin: "30",
      isActive: true,
      isBuiltin: false,
    });
    setTreatmentModalOpen(true);
  }

  function openEditTreatment(row: TreatmentTypeRow) {
    setEditingTreatment({
      id: row.id,
      label: row.label,
      color: row.color,
      priceInvoice: String(row.price_invoice ?? ""),
      priceCash: String(row.price_cash ?? ""),
      durationMin: String(row.duration_min ?? 30),
      isActive: row.is_active,
      isBuiltin: row.is_builtin,
    });
    setTreatmentModalOpen(true);
  }

  function closeTreatmentModal() {
    setTreatmentModalOpen(false);
    setEditingTreatment(null);
  }

  async function saveTreatment() {
    if (!currentStudioId || !editingTreatment) return;
    const f = editingTreatment;
    const label = f.label.trim();
    if (label.length < 2) { setError("Nome trattamento troppo corto."); return; }
    const pi = Number(f.priceInvoice.replace(",", "."));
    const pc = Number(f.priceCash.replace(",", "."));
    const dm = Number(f.durationMin);
    if (!Number.isFinite(pi) || pi < 0) { setError("Prezzo con ricevuta non valido."); return; }
    if (!Number.isFinite(pc) || pc < 0) { setError("Prezzo in contanti non valido."); return; }
    if (!Number.isFinite(dm) || dm <= 0 || dm > 480) { setError("Durata non valida (1-480 min)."); return; }

    setSavingTreatment(true);
    setError("");
    try {
      if (f.id) {
        const { error: upErr } = await supabase
          .from("treatment_types")
          .update({ label, color: f.color, price_invoice: pi, price_cash: pc, duration_min: dm, is_active: f.isActive })
          .eq("id", f.id);
        if (upErr) throw new Error(upErr.message);
      } else {
        let key = keyFromLabel(label);
        const existingKeys = new Set(treatments.map(t => t.key));
        if (existingKeys.has(key)) {
          let n = 2;
          while (existingKeys.has(`${key}_${n}`)) n++;
          key = `${key}_${n}`;
        }
        const maxOrder = treatments.reduce((m, t) => Math.max(m, t.sort_order), 0);
        const { error: insErr } = await supabase
          .from("treatment_types")
          .insert({
            studio_id: currentStudioId,
            key, label, color: f.color,
            price_invoice: pi, price_cash: pc, duration_min: dm,
            is_active: f.isActive,
            sort_order: maxOrder + 10,
            is_builtin: false,
          });
        if (insErr) throw new Error(insErr.message);
      }
      closeTreatmentModal();
      await reloadTreatments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore salvataggio.");
    } finally {
      setSavingTreatment(false);
    }
  }

  async function toggleTreatmentActive(row: TreatmentTypeRow) {
    if (row.is_builtin && row.is_active) {
      const ok = confirm(`Disattivare "${row.label}"?\n\nNon comparirà più nei selettori del calendario, ma gli appuntamenti già esistenti restano invariati.`);
      if (!ok) return;
    }
    setSavingTreatment(true);
    try {
      const { error: upErr } = await supabase.from("treatment_types").update({ is_active: !row.is_active }).eq("id", row.id);
      if (upErr) throw new Error(upErr.message);
      await reloadTreatments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore.");
    } finally {
      setSavingTreatment(false);
    }
  }

  async function deleteTreatment(row: TreatmentTypeRow) {
    const ok = confirm(`Cancellare "${row.label}"?\n\nGli appuntamenti già creati con questo tipo manterranno la dicitura, ma non potrai più crearne di nuovi.${row.is_builtin ? "\n\n⚠️ Stai cancellando una voce di sistema." : ""}`);
    if (!ok) return;
    setSavingTreatment(true);
    try {
      const { error: delErr } = await supabase.from("treatment_types").delete().eq("id", row.id);
      if (delErr) throw new Error(delErr.message);
      await reloadTreatments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore cancellazione.");
    } finally {
      setSavingTreatment(false);
    }
  }

  async function moveTreatment(row: TreatmentTypeRow, direction: -1 | 1) {
    const sorted = [...treatments].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(t => t.id === row.id);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    const other = sorted[newIdx];
    setSavingTreatment(true);
    try {
      await supabase.from("treatment_types").update({ sort_order: other.sort_order }).eq("id", row.id);
      await supabase.from("treatment_types").update({ sort_order: row.sort_order }).eq("id", other.id);
      await reloadTreatments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore riordino.");
    } finally {
      setSavingTreatment(false);
    }
  }

  async function changePassword() {
    setPwError(""); setPwSuccess("");
    if (pwNew.length < 8) { setPwError("Minimo 8 caratteri."); return; }
    if (pwNew !== pwConfirm) { setPwError("Le password non coincidono."); return; }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw error;
      setPwSuccess("Password aggiornata."); setPwNew(""); setPwConfirm("");
    } catch(e:any){ setPwError(e?.message||"Errore"); }
    finally { setPwSaving(false); }
  }

  // ── Granularità agenda (parità con desktop, mig. 061) ──
  // Il valore mostrato deriva dallo studio (fonte di verità); lo stato locale
  // esiste solo per il feedback ottimistico durante il salvataggio.
  const [pendingSlot, setPendingSlot] = useState<15 | 30 | null>(null);
  const [savingMobSlot, setSavingMobSlot] = useState(false);
  const mobSlotMin: 15 | 30 =
    pendingSlot ?? ((((currentStudio as { slot_minutes?: number } | null)?.slot_minutes) === 15) ? 15 : 30);
  async function saveMobSlot(v: 15 | 30) {
    if (!currentStudioId) return;
    setPendingSlot(v); setSavingMobSlot(true);
    try {
      const { error } = await supabase.from("studios").update({ slot_minutes: v }).eq("id", currentStudioId);
      if (error) throw error;
      await refreshStudio();
      setSuccess(`Agenda impostata a slot di ${v} minuti.`); setTimeout(()=>setSuccess(""), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore salvataggio granularità");
      setTimeout(()=>setError(""), 3500);
    } finally { setSavingMobSlot(false); setPendingSlot(null); }
  }

  // ── Ricerca impostazioni (stessa barra del desktop) ──
  const MOBILE_INDEX: SettingsSearchItem[] = [
    { id: "studio",        label: "Dati studio",              place: "Impostazioni", keywords: "nome studio contatti telefono email indirizzo intestazione logo firma branding" },
    { id: "fiscale",       label: "Contabilità e Sistema TS",   place: "Impostazioni", keywords: "partita iva p.iva pec codice fiscale sistema tessera sanitaria ts invio spese sanitarie regime forfettario fatture credenziali" },
    { id: "sedi",          label: "Sedi di lavoro",           place: "Impostazioni", keywords: "sedi multi sede location ambulatorio indirizzi" },
    { id: "agenda",        label: "Preferenze agenda (granularità, vista)", place: "Impostazioni", keywords: "granularità slot 15 minuti 30 minuti passo vista predefinita giorno settimana mese apertura calendario" },
    { id: "calprefs",      label: "Preferenze appuntamenti",  place: "Impostazioni", keywords: "stato predefinito confermato prenotato sovrapposizioni overlap prezzi automatici gruppo partecipanti" },
    { id: "chiusure",      label: "Giorni di chiusura e ferie", place: "Impostazioni", keywords: "chiusure ferie ponte giorni bloccati vacanze blocco agenda festivi" },
    { id: "convenzioni",   label: "Convenzioni (fondi e assicurazioni)", place: "Impostazioni", keywords: "convenzioni fondi assicurazioni casse mutue previmedical unisalute metasalute enti listini autorizzazione" },
    { id: "team",          label: "Team e collaboratori",     place: "Impostazioni", keywords: "team membri operatori multi operatore invito collaboratori layout settimana colonne" },
    { id: "stanze",        label: "Stanze e box",             place: "Impostazioni", keywords: "stanze box sale multi stanza room lettini" },
    { id: "assenze",       label: "Assenze operatori",        place: "Impostazioni", keywords: "assenze ferie permessi malattia operatori indisponibilità" },
    { id: "ospiti",        label: "Professionisti ospiti",    place: "Impostazioni", keywords: "ospiti professionisti esterni ortopedico nutrizionista token agenda ospite" },
    { id: "notifiche",     label: "Notifiche pazienti",       place: "Impostazioni", keywords: "notifiche conferme annullamenti whatsapp link promemoria" },
    { id: "report",        label: "Report automatici",        place: "Impostazioni", keywords: "report automatici email riepilogo pdf mensile" },
    { id: "template",      label: "Template messaggi",        place: "Impostazioni", keywords: "template messaggi whatsapp promemoria testo variabili firma benvenuto compleanno pagamento" },
    { id: "integrazioni",  label: "Integrazioni e backup",    place: "Impostazioni", keywords: "integrazioni google calendar ics feed esterno sincronizzazione backup esporta csv" },
    { id: "booking-legacy",label: "Prenotazioni dal sito",    place: "Impostazioni", keywords: "prenotazioni online booking sito pubblico link" },
    { id: "servizi",       label: "Servizi prenotabili online", place: "Impostazioni", keywords: "prenotazioni online booking servizi prenotabili prezzo durata" },
    { id: "catalogo",      label: "Catalogo trattamenti",     place: "Impostazioni", keywords: "trattamenti catalogo prestazioni tecar laser prezzi durata colore" },
    { id: "orari",         label: "Orari di lavoro",          place: "Impostazioni", keywords: "orari apertura chiusura giorni settimana working hours" },
    { id: "gestione",      label: "Gestione e obiettivi",     place: "Impostazioni", keywords: "gestione obiettivi soglie incassi inattivo promemoria ore" },
    { id: "pagamenti",     label: "Pagamenti e obiettivo mensile", place: "Impostazioni", keywords: "pagamenti metodo contanti pos bonifico default obbligatorio obiettivo fatturato" },
    { id: "privacy",       label: "Modalità privacy",         place: "Impostazioni", keywords: "privacy nascondi nomi pazienti iniziali screenshot" },
    { id: "password",      label: "Cambio password",          place: "Impostazioni", keywords: "password credenziali accesso sicurezza" },
  ];
  const jumpToSection = (id: string) => {
    // Card condivise (parità desktop): si aprono col loro stato dedicato.
    const openMapM: Record<string, (v: boolean) => void> = {
      fiscale: setShowFiscM, pagamenti: setShowPayM, gestione: setShowGestM,
      calprefs: setShowCalPrefsM, chiusure: setShowBlockM, servizi: setShowSvcM,
      team: setShowTeamM, stanze: setShowRoomsM, assenze: setShowAbsM,
      template: setShowTemplM, integrazioni: setShowIntegrM,
    };
    if (openMapM[id]) openMapM[id](true);
    else if (id !== "agenda") setActiveSection(id);
    setTimeout(() => {
      document.getElementById("msec-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  };

  // ═══════════════════════════════════════════════════════════════════════
  // PARITÀ DESKTOP (portata 1:1 dal SettingsDesktopClient) — stati
  // ═══════════════════════════════════════════════════════════════════════
  const [showAgendaPrefsM, setShowAgendaPrefsM] = useState(false);
  const [showCalPrefsM, setShowCalPrefsM]   = useState(false);
  const [showBlockM, setShowBlockM]         = useState(false);
  const [showSvcM, setShowSvcM]             = useState(false);
  const [showTeamM, setShowTeamM]           = useState(false);
  const [showRoomsM, setShowRoomsM]         = useState(false);
  const [showAbsM, setShowAbsM]             = useState(false);
  const [showTemplM, setShowTemplM]         = useState(false);
  const [showIntegrM, setShowIntegrM]       = useState(false);
  const [showFiscM, setShowFiscM]           = useState(false);
  const [showPayM, setShowPayM]             = useState(false);
  const [showGestM, setShowGestM]           = useState(false);

  const [loadingPractice, setLoadingPractice] = useState(false);
  const [savingPractice, setSavingPractice]   = useState(false);
  const [ownerFullName, setOwnerFullName]     = useState("");
  const [defaultApptStatus, setDefaultApptStatus] = useState<"confirmed" | "booked">("confirmed");
  const [autoApplyPrices, setAutoApplyPrices] = useState(true);
  const [defaultGroupPrice, setDefaultGroupPrice] = useState("15.00");
  const [defaultGroupMaxParticipants, setDefaultGroupMaxParticipants] = useState("6");
  const [groupStatsCountAsSeparate, setGroupStatsCountAsSeparate] = useState(false);
  const [savingGroupStats, setSavingGroupStats] = useState(false);
  const [reminderHours, setReminderHours]     = useState("24");

  const [tsEnabled, setTsEnabled] = useState(false);
  const [tsTipoSpesaDefault, setTsTipoSpesaDefault] = useState("SP");
  const [tsNumberingMode, setTsNumberingMode] = useState("external");
  const [tsCfProprietario, setTsCfProprietario] = useState("");
  const [tsRegimeForfettario, setTsRegimeForfettario] = useState(true);
  const [tsDispositivo, setTsDispositivo] = useState(1);
  const [tsWsUser, setTsWsUser] = useState("");
  const [tsWsPassword, setTsWsPassword] = useState("");
  const [tsWsPincode, setTsWsPincode] = useState("");
  const [tsWsAmbiente, setTsWsAmbiente] = useState<"test" | "prod">("test");
  const [tsReminderCadences, setTsReminderCadences] = useState<string[]>(["monthly"]);
  const [tsRecapCadences, setTsRecapCadences] = useState<string[]>([]);
  const [tsInvioEmailEnabled, setTsInvioEmailEnabled] = useState(true);

  const [welcomeMsg, setWelcomeMsg]               = useState("");
  const [bookingConfirmMsg, setBookingConfirmMsg] = useState("");
  const [reminderMsg, setReminderMsg]             = useState("");
  const [weeklyReminderMsg, setWeeklyReminderMsg] = useState("");
  const [paymentMsg, setPaymentMsg]               = useState("");
  const [birthdayMsg, setBirthdayMsg]             = useState("");
  const [satisfactionMsg, setSatisfactionMsg]     = useState("");

  const [templates, setTemplates]       = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editName, setEditName]         = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  const [newName, setNewName]           = useState("");
  const [newTemplate, setNewTemplate]   = useState("");
  const [addingNew, setAddingNew]       = useState(false);

  const [services, setServices]               = useState<BookableService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [savingSvc, setSavingSvc]             = useState(false);
  const [newSvcName, setNewSvcName]           = useState("");
  const [newSvcDuration, setNewSvcDuration]   = useState("60");
  const [newSvcPrice, setNewSvcPrice]         = useState("40");

  const [blockDays, setBlockDays]         = useState<BlockedDay[]>([]);
  const [savingBlock, setSavingBlock]     = useState(false);
  const [newBlockDate, setNewBlockDate]   = useState("");
  const [newBlockLabel, setNewBlockLabel] = useState("");

  const [members, setMembers]                   = useState<StudioMemberRow[]>([]);
  const [loadingMembers, setLoadingMembers]     = useState(false);
  const [savingMember, setSavingMember]         = useState(false);
  const [mobUserId, setMobUserId]               = useState<string | null>(null);
  const [multiOperatorEnabled, setMultiOperatorEnabled] = useState(false);
  const [savingMultiOpToggle, setSavingMultiOpToggle]   = useState(false);
  const [weeklyViewLayout, setWeeklyViewLayout] = useState<"classic" | "timeline" | "pile" | "grid" | "roster">("classic");
  const [savingWeeklyLayout, setSavingWeeklyLayout] = useState(false);
  const [defaultCalendarView, setDefaultCalendarView] = useState<"day" | "week" | "month">("week");
  const [savingDefaultCalendarView, setSavingDefaultCalendarView] = useState(false);

  const [rooms, setRooms]                 = useState<StudioRoomRow[]>([]);
  const [loadingRooms, setLoadingRooms]   = useState(false);
  const [savingRoom, setSavingRoom]       = useState(false);
  const [multiRoomEnabled, setMultiRoomEnabled] = useState(false);
  const [savingMultiRoomToggle, setSavingMultiRoomToggle] = useState(false);
  const [allTreatments, setAllTreatments] = useState<Array<{
    id: string; key: string; label: string; color: string;
    price_invoice: number; price_cash: number; duration_min: number;
    is_active: boolean; sort_order: number; is_builtin: boolean;
    studio_id: string;
  }>>([]);

  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [calendarTokenLoading, setCalendarTokenLoading] = useState(false);
  const [calendarTokenRotating, setCalendarTokenRotating] = useState(false);
  const [exportingBackup, setExportingBackup] = useState(false);

  const dynamicSignature = useMemo(
    () => [signatureName, signatureTitle].filter(x => x.trim()).join("\n"),
    [signatureName, signatureTitle]
  );

  const flashOk = (m: string) => { setSuccess(m); setTimeout(() => setSuccess(""), 2500); };

  // ═══ Funzioni (fedeli al desktop; studio.id → currentStudioId) ═══
  async function requireUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    const uid = data?.user?.id;
    if (!uid) throw new Error("Utente non autenticato.");
    return uid;
  }

  const loadPracticeFull = useCallback(async () => {
    setLoadingPractice(true);
    try {
      const uid = await requireUserId();
      setMobUserId(uid);
      const { data, error } = await supabase
        .from("practice_settings")
        .select("*")
        .eq("owner_id", uid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return;
      const d = data as PracticeSettingsRow;
      setOwnerName(d.owner_full_name ?? "");
      setOwnerFullName(d.owner_full_name ?? "");
      setVatNumber(d.vat_number ?? "");
      setPecEmail(d.pec_email ?? "");
      setTsEnabled(Boolean(d.ts_enabled));
      setTsTipoSpesaDefault(d.ts_tipo_spesa_default ?? "SP");
      setTsNumberingMode(d.ts_numbering_mode ?? "external");
      setTsCfProprietario((d.ts_cf_proprietario ?? "").toUpperCase());
      setTsRegimeForfettario(d.ts_regime_forfettario !== false);
      setTsDispositivo(Number(d.ts_dispositivo ?? 1) || 1);
      setTsWsUser((d.ts_ws_user ?? "").trim());
      setTsWsPassword(d.ts_ws_password ?? "");
      setTsWsPincode((d.ts_ws_pincode ?? "").trim());
      setTsWsAmbiente(d.ts_ws_ambiente === "prod" ? "prod" : "test");
      {
        const raw = (d.ts_reminder_cadence ?? "monthly").trim();
        const valid = ["monthly", "quarterly", "semiannual", "annual"];
        setTsReminderCadences(raw === "off" || raw === "" ? [] : raw.split(",").map(x => x.trim()).filter(x => valid.includes(x)));
      }
      setTsInvioEmailEnabled(d.ts_invio_email_enabled !== false);
      {
        const raw = (d.ts_recap_cadence ?? "").trim();
        const valid = ["monthly", "annual"];
        setTsRecapCadences(raw === "off" || raw === "" ? [] : raw.split(",").map(x => x.trim()).filter(x => valid.includes(x)));
      }
      setAutoApplyPrices(d.auto_apply_prices ?? true);
      setDefaultGroupPrice(toMoneyString(d.default_group_price, "15.00"));
      setDefaultGroupMaxParticipants(String(d.default_group_max_participants ?? 6));
      setWelcomeMsg(d.welcome_message ?? "");
      setBookingConfirmMsg(d.booking_confirm_message ?? "");
      setReminderMsg(d.reminder_message ?? "");
      setWeeklyReminderMsg(d.weekly_reminder_message ?? "");
      setPaymentMsg(d.payment_message ?? "");
      setBirthdayMsg(d.birthday_message ?? "");
      setSatisfactionMsg(d.satisfaction_message ?? "");
      setDefaultApptStatus((d.default_appointment_status ?? "confirmed") as "confirmed" | "booked");
      setOverlapMode((d.overlap_mode ?? "warn") as "block" | "warn" | "visual");
      setPaymentMethodRequired(d.payment_method_required ?? true);
      setDefaultPaymentMethod((d.default_payment_method ?? "pos") as "cash" | "pos" | "bank_transfer");
      setMonthlyGoal(String(d.monthly_revenue_goal ?? 2000));
      setInactiveThresh(String(d.inactive_threshold_days ?? 45));
      setReminderHours(String(d.reminder_hours_before ?? 24));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento impostazioni");
    } finally {
      setLoadingPractice(false);
    }
  }, []);

  async function savePracticeFull() {
    setSavingPractice(true);
    try {
      const uid = await requireUserId();
      const payload: Record<string, unknown> = {
        owner_id: uid,
        studio_id: currentStudioId,
        practice_name: practiceName.trim() || "Studio",
        owner_full_name: ownerFullName.trim() || ownerName.trim(),
        vat_number: vatNumber.trim() || "",
        pec_email: pecEmail.trim() || "",
        ts_enabled: tsEnabled,
        ts_tipo_spesa_default: tsTipoSpesaDefault,
        ts_numbering_mode: tsNumberingMode,
        ts_cf_proprietario: tsCfProprietario.trim().toUpperCase(),
        ts_regime_forfettario: tsRegimeForfettario,
        ts_dispositivo: tsDispositivo,
        ts_ws_user: tsWsUser.trim(),
        ts_ws_password: tsWsPassword,
        ts_ws_pincode: tsWsPincode.trim(),
        ts_ws_ambiente: tsWsAmbiente,
        ts_reminder_cadence: tsReminderCadences.length ? tsReminderCadences.join(",") : "off",
        ts_invio_email_enabled: tsInvioEmailEnabled,
        ts_recap_cadence: tsRecapCadences.length ? tsRecapCadences.join(",") : "",
        auto_apply_prices: autoApplyPrices,
        default_group_price: parseFloat(defaultGroupPrice) || 15,
        default_group_max_participants: parseInt(defaultGroupMaxParticipants) || 6,
        welcome_message: welcomeMsg.trim() || null,
        booking_confirm_message: bookingConfirmMsg.trim() || null,
        reminder_message: reminderMsg.trim() || null,
        weekly_reminder_message: weeklyReminderMsg.trim() || null,
        payment_message: paymentMsg.trim() || null,
        birthday_message: birthdayMsg.trim() || null,
        satisfaction_message: satisfactionMsg.trim() || null,
        default_appointment_status: defaultApptStatus,
        overlap_mode: overlapMode,
        payment_method_required: paymentMethodRequired,
        default_payment_method: defaultPaymentMethod,
        monthly_revenue_goal: parseFloat(monthlyGoal) || 2000,
        inactive_threshold_days: parseInt(inactiveThresh) || 45,
        reminder_hours_before: parseInt(reminderHours) || 24,
      };
      const { error } = await supabase.from("practice_settings").upsert(payload, { onConflict: "owner_id" });
      if (error) throw new Error(error.message);
      flashOk("Impostazioni salvate.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore salvataggio");
      setTimeout(() => setError(""), 3500);
    } finally {
      setSavingPractice(false);
    }
  }

  const saveGroupStats = useCallback(async () => {
    if (!currentStudioId) return;
    setSavingGroupStats(true);
    try {
      const { error } = await supabase
        .from("studios")
        .update({ group_stats_count_as_separate: groupStatsCountAsSeparate })
        .eq("id", currentStudioId);
      if (error) { setError("Errore: " + error.message); return; }
      await refreshStudio();
      flashOk("Preferenza statistiche di gruppo salvata.");
    } finally {
      setSavingGroupStats(false);
    }
  }, [currentStudioId, groupStatsCountAsSeparate, refreshStudio]);

  // ── Templates messaggi ──
  async function loadTemplates() {
    setLoadingTemplates(true);
    try {
      const { data, error } = await supabase
        .from("message_templates").select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      setTemplates((data as MessageTemplate[]) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento template");
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  }
  async function saveTemplate(id: string) {
    if (!editName.trim() || !editTemplate.trim()) { setError("Nome e template sono obbligatori"); return; }
    try {
      const { error } = await supabase.from("message_templates")
        .update({ name: editName.trim(), template: editTemplate.trim(), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
      flashOk("Template salvato."); setEditingId(null); await loadTemplates();
    } catch (e) { setError(e instanceof Error ? e.message : "Errore salvataggio template"); }
  }
  async function deleteTemplate(id: string) {
    if (templates.length <= 1) { setError("Non puoi eliminare l'unico template disponibile"); return; }
    const t = templates.find(x => x.id === id);
    if (!t) return;
    if (!confirm("Eliminare questo template? L'operazione non può essere annullata.")) return;
    try {
      if (t.is_default) {
        const other = templates.find(x => x.id !== id);
        if (other) {
          const { error: e1 } = await supabase.from("message_templates").update({ is_default: true }).eq("id", other.id);
          if (e1) throw new Error(e1.message);
        }
      }
      const { error } = await supabase.from("message_templates").delete().eq("id", id);
      if (error) throw new Error(error.message);
      flashOk("Template eliminato."); await loadTemplates();
    } catch (e) { setError(e instanceof Error ? e.message : "Errore eliminazione"); }
  }
  async function setAsDefault(id: string) {
    try {
      const { error: e1 } = await supabase.from("message_templates").update({ is_default: false }).neq("id", id);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase.from("message_templates").update({ is_default: true }).eq("id", id);
      if (e2) throw new Error(e2.message);
      flashOk("Template impostato come predefinito."); await loadTemplates();
    } catch (e) { setError(e instanceof Error ? e.message : "Errore"); }
  }
  async function createNewTemplate() {
    if (!newName.trim() || !newTemplate.trim()) { setError("Nome e template sono obbligatori"); return; }
    if (!currentStudioId) { setError("Studio non identificato. Ricarica la pagina."); return; }
    try {
      const { error } = await supabase.from("message_templates").insert({
        name: newName.trim(), template: newTemplate.trim(),
        is_default: templates.length === 0, studio_id: currentStudioId,
      });
      if (error) throw new Error(error.message);
      flashOk("Nuovo template creato."); setNewName(""); setNewTemplate(""); setAddingNew(false);
      await loadTemplates();
    } catch (e) { setError(e instanceof Error ? e.message : "Errore creazione"); }
  }
  async function saveAutoMessages() { await savePracticeFull(); }

  // ── Servizi prenotabili ──
  async function loadServices() {
    setLoadingServices(true);
    try {
      const { data } = await supabase.from("booking_services").select("*").order("name");
      setServices((data as BookableService[]) || []);
    } finally { setLoadingServices(false); }
  }
  async function addService() {
    if (!newSvcName.trim()) return;
    if (!currentStudioId) { setError("Studio non identificato. Ricarica la pagina."); return; }
    setSavingSvc(true);
    try {
      const { error } = await supabase.from("booking_services").insert({
        name: newSvcName.trim(), duration: parseInt(newSvcDuration) || 60,
        price: parseFloat(newSvcPrice) || 40, studio_id: currentStudioId,
      });
      if (error) throw new Error(error.message);
      setNewSvcName(""); setNewSvcDuration("60"); setNewSvcPrice("40");
      await loadServices();
    } catch (e) { setError(e instanceof Error ? e.message : "Errore"); }
    finally { setSavingSvc(false); }
  }
  async function deleteService(id: string) {
    if (!confirm("Eliminare questo servizio?")) return;
    await supabase.from("booking_services").delete().eq("id", id);
    await loadServices();
  }

  // ── Giorni di blocco ──
  async function loadBlockDays() {
    const { data } = await supabase.from("blocked_days").select("*").order("date");
    setBlockDays((data as BlockedDay[]) || []);
  }
  async function addBlockDay() {
    if (!newBlockDate) return;
    if (!currentStudioId) { setError("Studio non identificato. Ricarica la pagina."); return; }
    setSavingBlock(true);
    try {
      const { error } = await supabase.from("blocked_days").insert({
        date: newBlockDate, label: newBlockLabel.trim() || "Chiuso", studio_id: currentStudioId,
      });
      if (error) throw new Error(error.message);
      setNewBlockDate(""); setNewBlockLabel("");
      await loadBlockDays();
    } catch (e) { setError(e instanceof Error ? e.message : "Errore"); }
    finally { setSavingBlock(false); }
  }
  async function deleteBlockDay(id: string) {
    await supabase.from("blocked_days").delete().eq("id", id);
    await loadBlockDays();
  }

  // ── Team ──
  const loadMembers = useCallback(async () => {
    if (!currentStudioId) return;
    setLoadingMembers(true);
    try {
      const { data, error } = await supabase
        .from("studio_members")
        .select("id, studio_id, user_id, role, display_name, display_color, signature_short, is_active, sort_order, email, invite_token, invited_at, permission_preset, permissions")
        .eq("studio_id", currentStudioId)
        .eq("is_active", true)
        .order("role", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) { setMembers([]); return; }
      setMembers((data || []) as StudioMemberRow[]);
    } finally { setLoadingMembers(false); }
  }, [currentStudioId]);

  const saveMultiOperatorToggle = useCallback(async () => {
    if (!currentStudioId) { setError("Studio non disponibile"); return; }
    setSavingMultiOpToggle(true);
    try {
      const { error } = await supabase.from("studios")
        .update({ multi_operator_enabled: multiOperatorEnabled }).eq("id", currentStudioId);
      if (error) { setError("Errore salvataggio multi-operatore: " + error.message); return; }
      await refreshStudio();
      // Tappa A (mig. 067): all'attivazione, backfill storico → owner.
      if (multiOperatorEnabled) {
        const { data: assigned, error: bfErr } = await supabase.rpc(
          "backfill_operator_assignments",
          { p_studio_id: currentStudioId }
        );
        if (!bfErr && typeof assigned === "number" && assigned > 0) {
          flashOk(`Multi-operatore attivato. ${assigned} appuntamenti assegnati a te.`);
        } else {
          flashOk("Multi-operatore attivato.");
        }
      } else {
        flashOk("Multi-operatore disattivato.");
      }
    } finally { setSavingMultiOpToggle(false); }
  }, [currentStudioId, multiOperatorEnabled, refreshStudio]);

  const saveWeeklyLayout = useCallback(async () => {
    if (!currentStudioId) { setError("Studio non disponibile"); return; }
    setSavingWeeklyLayout(true);
    try {
      const { error } = await supabase.from("studios")
        .update({ weekly_view_layout: weeklyViewLayout }).eq("id", currentStudioId);
      if (error) { setError("Errore salvataggio layout: " + error.message); return; }
      await refreshStudio();
      flashOk("Layout settimana aggiornato.");
    } finally { setSavingWeeklyLayout(false); }
  }, [currentStudioId, weeklyViewLayout, refreshStudio]);

  const saveDefaultCalendarViewM = useCallback(async () => {
    if (!currentStudioId) { setError("Studio non disponibile"); return; }
    setSavingDefaultCalendarView(true);
    try {
      const { error } = await supabase.from("studios")
        .update({ default_calendar_view: defaultCalendarView }).eq("id", currentStudioId);
      if (error) { setError("Errore salvataggio vista predefinita: " + error.message); return; }
      await refreshStudio();
      const labelMap = { day: "Giorno", week: "Settimana", month: "Mese" } as const;
      flashOk(`Vista predefinita aggiornata: ${labelMap[defaultCalendarView]}.`);
    } finally { setSavingDefaultCalendarView(false); }
  }, [currentStudioId, defaultCalendarView, refreshStudio]);

  const createInvite = useCallback(async (payload: {
    display_name: string; email: string; role: StudioMemberRow["role"];
    display_color: string; signature_short: string;
  }): Promise<{ inviteToken: string } | null> => {
    if (!currentStudioId) { setError("Studio non disponibile"); return null; }
    setSavingMember(true);
    try {
      const existing = members.find(m => m.email && m.email.toLowerCase() === payload.email.toLowerCase());
      if (existing) {
        setError(`Email ${payload.email} già usata${existing.user_id == null ? " da un invito pendente" : " da un membro"}.`);
        return null;
      }
      const inviteToken = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
      const maxSort = members.reduce((m, x) => Math.max(m, x.sort_order ?? 0), 0);
      const { error } = await supabase.from("studio_members").insert({
        studio_id: currentStudioId, user_id: null, role: payload.role,
        display_name: payload.display_name, display_color: payload.display_color,
        signature_short: payload.signature_short, is_active: true,
        sort_order: maxSort + 1, email: payload.email,
        invite_token: inviteToken, invited_at: new Date().toISOString(),
      });
      if (error) { setError("Errore creazione invito: " + error.message); return null; }
      await loadMembers();
      flashOk(`Invito creato per ${payload.email}. Copia il link e condividilo.`);
      return { inviteToken };
    } finally { setSavingMember(false); }
  }, [currentStudioId, members, loadMembers]);

  const updateMember = useCallback(async (
    userIdOrToken: string, isToken: boolean,
    payload: Partial<{ display_name: string; role: StudioMemberRow["role"]; display_color: string; signature_short: string }>
  ) => {
    if (!currentStudioId) return;
    setSavingMember(true);
    try {
      const upd: Record<string, unknown> = {};
      if (payload.display_name !== undefined) upd.display_name = payload.display_name;
      if (payload.role !== undefined) upd.role = payload.role;
      if (payload.display_color !== undefined) upd.display_color = payload.display_color;
      if (payload.signature_short !== undefined) upd.signature_short = payload.signature_short;
      const query = supabase.from("studio_members").update(upd).eq("studio_id", currentStudioId);
      const { error } = await (isToken ? query.eq("invite_token", userIdOrToken) : query.eq("user_id", userIdOrToken));
      if (error) { setError("Errore aggiornamento membro: " + error.message); return; }
      await loadMembers();
      flashOk("Membro aggiornato.");
    } finally { setSavingMember(false); }
  }, [currentStudioId, loadMembers]);

  const deleteMember = useCallback(async (userIdOrToken: string, isToken: boolean) => {
    if (!currentStudioId) return;
    setSavingMember(true);
    try {
      if (isToken) {
        const { error } = await supabase.from("studio_members").delete()
          .eq("studio_id", currentStudioId).eq("invite_token", userIdOrToken);
        if (error) { setError("Errore annullamento invito: " + error.message); return; }
        flashOk("Invito annullato.");
      } else {
        const { error } = await supabase.from("studio_members").update({ is_active: false })
          .eq("studio_id", currentStudioId).eq("user_id", userIdOrToken);
        if (error) { setError("Errore rimozione membro: " + error.message); return; }
        flashOk("Membro rimosso dal team.");
      }
      await loadMembers();
    } finally { setSavingMember(false); }
  }, [currentStudioId, loadMembers]);

  // ── Stanze ──
  const loadRooms = useCallback(async () => {
    if (!currentStudioId) return;
    setLoadingRooms(true);
    try {
      const { data, error } = await supabase
        .from("studio_rooms")
        .select("id, studio_id, location_id, name, color, is_active, sort_order, treatment_types, created_at, updated_at")
        .eq("studio_id", currentStudioId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) { setRooms([]); return; }
      setRooms((data || []) as StudioRoomRow[]);
    } finally { setLoadingRooms(false); }
  }, [currentStudioId]);

  const loadAllTreatments = useCallback(async () => {
    if (!currentStudioId) return;
    try {
      const { data, error } = await supabase
        .from("treatment_types")
        .select("id, studio_id, key, label, color, price_invoice, price_cash, duration_min, is_active, sort_order, is_builtin")
        .eq("studio_id", currentStudioId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) { setAllTreatments([]); return; }
      setAllTreatments((data || []) as typeof allTreatments);
    } catch { setAllTreatments([]); }
  }, [currentStudioId]);

  const saveMultiRoomToggle = useCallback(async () => {
    if (!currentStudioId) { setError("Studio non disponibile"); return; }
    setSavingMultiRoomToggle(true);
    try {
      const { error } = await supabase.from("studios")
        .update({ multi_room_enabled: multiRoomEnabled }).eq("id", currentStudioId);
      if (error) { setError("Errore salvataggio multi-stanza: " + error.message); return; }
      await refreshStudio();
      flashOk(multiRoomEnabled ? "Multi-stanza attivato." : "Multi-stanza disattivato.");
    } finally { setSavingMultiRoomToggle(false); }
  }, [currentStudioId, multiRoomEnabled, refreshStudio]);

  const createRoom = useCallback(async (payload: {
    name: string; color: string | null; location_id: string | null; treatment_types: string[] | null;
  }) => {
    if (!currentStudioId) return;
    setSavingRoom(true);
    try {
      const maxSort = rooms.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0);
      const { error } = await supabase.from("studio_rooms").insert({
        studio_id: currentStudioId, location_id: payload.location_id, name: payload.name,
        color: payload.color, is_active: true, sort_order: maxSort + 1,
        treatment_types: payload.treatment_types,
      });
      if (error) { setError("Errore creazione stanza: " + error.message); return; }
      await loadRooms();
      flashOk("Stanza aggiunta.");
    } finally { setSavingRoom(false); }
  }, [currentStudioId, rooms, loadRooms]);

  const updateRoom = useCallback(async (id: string, payload: Partial<{
    name: string; color: string | null; location_id: string | null; treatment_types: string[] | null;
  }>) => {
    if (!currentStudioId) return;
    setSavingRoom(true);
    try {
      const upd: Record<string, unknown> = {};
      if (payload.name !== undefined) upd.name = payload.name;
      if (payload.color !== undefined) upd.color = payload.color;
      if (payload.location_id !== undefined) upd.location_id = payload.location_id;
      if (payload.treatment_types !== undefined) upd.treatment_types = payload.treatment_types;
      const { error } = await supabase.from("studio_rooms").update(upd).eq("id", id);
      if (error) { setError("Errore aggiornamento stanza: " + error.message); return; }
      await loadRooms();
      flashOk("Stanza aggiornata.");
    } finally { setSavingRoom(false); }
  }, [currentStudioId, loadRooms]);

  const deleteRoom = useCallback(async (id: string) => {
    if (!currentStudioId) return;
    setSavingRoom(true);
    try {
      const { error } = await supabase.from("studio_rooms").update({ is_active: false }).eq("id", id);
      if (error) { setError("Errore eliminazione stanza: " + error.message); return; }
      await loadRooms();
      flashOk("Stanza eliminata.");
    } finally { setSavingRoom(false); }
  }, [currentStudioId, loadRooms]);

  // ── Token calendario ICS + backup ──
  const rotateCalendarToken = async () => {
    if (!confirm("Sei sicuro di voler rigenerare il token?\n\nIl vecchio URL non funzionerà più. Dovrai aggiornare l'URL anche in Google Calendar.")) return;
    setCalendarTokenRotating(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) { setError("Sessione scaduta. Ricarica la pagina."); return; }
      const r = await fetch("/api/calendar-token", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
      const j = await r.json();
      if (r.ok && j.token) { setCalendarToken(j.token); flashOk("Nuovo token generato."); }
      else setError(j.error || "Errore generazione nuovo token");
    } catch { setError("Errore di rete. Riprova."); }
    finally { setCalendarTokenRotating(false); }
  };
  const copyCalendarLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => flashOk("Link copiato!"));
  };
  async function exportBackup() {
    setExportingBackup(true);
    try {
      const [{ data: pts }, { data: appts }, { data: nols }] = await Promise.all([
        supabase.from("patients").select("*").order("last_name"),
        supabase.from("appointments").select("*,patients:patient_id(first_name,last_name)").order("start_at", { ascending: false }),
        supabase.from("noleggios").select("*").order("created_at", { ascending: false }),
      ]);
      const esc = (v: unknown): string => {
        const x = String(v ?? "");
        if (x.indexOf(";") >= 0 || x.indexOf("\"") >= 0 || x.indexOf("\n") >= 0 || x.indexOf("\r") >= 0) return `"${x.replace(/"/g, "\"\"")}"`;
        return x;
      };
      const bom = "\uFEFF";
      type Row = Record<string, unknown> & { patients?: { first_name?: string; last_name?: string } | Array<{ first_name?: string; last_name?: string }> };
      const ptRows = ((pts || []) as Row[]).map(pz =>
        [pz.id, pz.last_name, pz.first_name, pz.phone, pz.birth_date, pz.tax_code, pz.res_city, pz.preferred_plan, String(pz.created_at ?? "").slice(0, 10)].map(esc).join(";"));
      const ptCsv = bom + [["ID","Cognome","Nome","Telefono","Data nascita","Codice fiscale","Indirizzo","Piano fatturazione","Creato il"].map(esc).join(";"), ...ptRows].join("\r\n");
      const apRows = ((appts || []) as Row[]).map(a => {
        const pz = Array.isArray(a.patients) ? a.patients[0] : a.patients;
        return [String(a.start_at ?? "").slice(0, 10), String(a.start_at ?? "").slice(11, 16), pz?.last_name, pz?.first_name, a.status, a.treatment_type, a.amount, a.is_paid ? "Si" : "No", a.clinic_site || a.location, a.price_type].map(esc).join(";");
      });
      const apCsv = bom + [["Data","Ora","Cognome","Nome","Stato","Tipo","Importo","Pagato","Sede","Fatturazione"].map(esc).join(";"), ...apRows].join("\r\n");
      const nlRows = ((nols || []) as Row[]).map(n =>
        [n.patient_name, n.device_name, n.start_date, n.end_date, n.price_per_day, n.total_amount, n.is_paid ? "Si" : "No", n.is_returned ? "Si" : "No"].map(esc).join(";"));
      const nlCsv = bom + [["Paziente","Dispositivo","Data inizio","Data fine","Prezzo/gg","Totale","Pagato","Reso"].map(esc).join(";"), ...nlRows].join("\r\n");
      const stamp = new Date().toISOString().slice(0, 10);
      for (const [name, csv] of [["pazienti", ptCsv], ["appuntamenti", apCsv], ["noleggi", nlCsv]] as const) {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const aEl = document.createElement("a");
        aEl.href = url; aEl.download = `fisiohub-${name}-${stamp}.csv`;
        document.body.appendChild(aEl); aEl.click(); aEl.remove();
        URL.revokeObjectURL(url);
      }
      flashOk("Backup esportato (3 file CSV).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore export backup");
    } finally { setExportingBackup(false); }
  }

  // ── Bootstrap parità: load unificata ──
  useEffect(() => {
    void loadPracticeFull();
    void loadTemplates();
    void loadServices();
    void loadBlockDays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!currentStudioId) return;
    void loadMembers();
    void loadRooms();
    void loadAllTreatments();
  }, [currentStudioId, loadMembers, loadRooms, loadAllTreatments]);
  useEffect(() => {
    if (currentStudio) {
      setMultiOperatorEnabled(Boolean((currentStudio as { multi_operator_enabled?: boolean }).multi_operator_enabled));
      setMultiRoomEnabled(Boolean((currentStudio as { multi_room_enabled?: boolean }).multi_room_enabled));
      setGroupStatsCountAsSeparate(Boolean((currentStudio as { group_stats_count_as_separate?: boolean }).group_stats_count_as_separate));
      const layout = (currentStudio as { weekly_view_layout?: string }).weekly_view_layout;
      setWeeklyViewLayout(layout === "classic" || layout === "timeline" || layout === "pile" || layout === "grid" || layout === "roster" ? layout : "classic");
      const dv = (currentStudio as { default_calendar_view?: string }).default_calendar_view;
      setDefaultCalendarView(dv === "day" || dv === "week" || dv === "month" ? dv : "week");
    }
  }, [currentStudio]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCalendarTokenLoading(true);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const accessToken = sess.session?.access_token;
        if (!accessToken) { if (!cancelled) setCalendarToken(null); return; }
        const r = await fetch("/api/calendar-token", { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
        const j = await r.json();
        if (!cancelled) setCalendarToken(r.ok ? (j.token ?? null) : null);
      } catch { if (!cancelled) setCalendarToken(null); }
      finally { if (!cancelled) setCalendarTokenLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const inp: React.CSSProperties = { width:"100%", padding:"11px 14px", borderRadius:10, border:`1.5px solid ${THEME.border}`, fontSize:15, fontWeight:500, background:"#fff", color:THEME.text, outline:"none", boxSizing:"border-box" };
  const lbl: React.CSSProperties = { display:"block", fontSize:11, fontWeight:700, color:THEME.muted, marginBottom:5, textTransform:"uppercase", letterSpacing:0.4 };

  const Section = ({id,title,sub,children}:{id:string,title:string,sub:string,children:React.ReactNode}) => (
    <div id={"msec-"+id} style={{ background:THEME.panelBg, borderRadius:14, border:`1px solid ${THEME.border}`, overflow:"hidden", marginBottom:12 }}>
      <div onClick={()=>setActiveSection(activeSection===id?null:id)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 18px", cursor:"pointer" }}>
        <div><div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>{title}</div><div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>{sub}</div></div>
        <span style={{ color:THEME.muted, fontSize:14, transform:activeSection===id?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
      </div>
      {activeSection===id && <div style={{ padding:"0 18px 18px", borderTop:`1px solid ${THEME.border}` }}>{children}</div>}
    </div>
  );

  return (
    <ToastProvider>
    <div style={{ minHeight:"100vh", background:THEME.appBg, fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", paddingBottom:80 }}>
      <style jsx global>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}body{margin:0;background:${THEME.appBg};}a{text-decoration:none;}input:focus{border-color:${THEME.teal}!important;outline:none!important;}`}</style>

      {/* Header */}
      <header style={{ background:THEME.gradient, padding:"14px 18px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:20 }}>
        <button onClick={()=>router.back()} style={{ background:"rgba(255,255,255,0.2)", border:"1.5px solid rgba(255,255,255,0.3)", borderRadius:8, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", padding:"6px 12px" }}>←</button>
        <div style={{ fontWeight:800, fontSize:17, color:"#fff" }}>Impostazioni</div>
      </header>

      <div style={{ padding:"16px" }}>
        <SettingsSearch items={MOBILE_INDEX} onJump={jumpToSection} placeholder="Cerca nelle impostazioni…" />
        {error && <div style={{ marginBottom:12, padding:"10px 14px", borderRadius:10, background:"rgba(220,38,38,0.06)", border:"1px solid rgba(220,38,38,0.2)", color:THEME.red, fontWeight:600, fontSize:13 }}>{error}</div>}
        {success && <div style={{ marginBottom:12, padding:"10px 14px", borderRadius:10, background:"rgba(22,163,74,0.06)", border:"1px solid rgba(22,163,74,0.2)", color:THEME.green, fontWeight:600, fontSize:13 }}>{success}</div>}

        <Section id="studio" title="Dati Studio" sub={practiceName||"Nome studio, contatti"}>
          <div style={{ display:"flex", flexDirection:"column", gap:12, paddingTop:14 }}>
            {[
              {l:"Nome studio",v:practiceName,s:setPracticeName,t:"text"},
              {l:"Titolare",v:ownerName,s:setOwnerName,t:"text"},
              {l:"Telefono",v:phone,s:setPhone,t:"tel"},
              {l:"Email",v:email,s:setEmail,t:"email"},
              {l:"Indirizzo",v:address,s:setAddress,t:"text"},
              {l:"Sito web",v:website,s:setWebsite,t:"url"},
            ].map(f=>(
              <div key={f.l}><label style={lbl}>{f.l}</label><input type={f.t} value={f.v} onChange={e=>f.s(e.target.value)} style={inp}/></div>
            ))}
            <div><label style={lbl}>Link Google Review</label><input value={googleReviewLink} onChange={e=>setGoogleReviewLink(e.target.value)} placeholder="https://g.page/r/..." style={inp}/></div>

            {/* ─── Firma per messaggi WhatsApp / promemoria ─── */}
            <div style={{ marginTop:8, padding:"12px 14px", borderRadius:10, background:THEME.panelSoft, border:`1px solid ${THEME.border}` }}>
              <div style={{ fontSize:12, fontWeight:700, color:THEME.muted, marginBottom:8, letterSpacing:0.3 }}>FIRMA NEI MESSAGGI</div>
              <div style={{ fontSize:11, color:THEME.muted, lineHeight:1.5, marginBottom:10 }}>
                Apparirà in fondo ai messaggi WhatsApp di promemoria/conferma inviati ai pazienti.
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div><label style={lbl}>Nome firma</label><input value={signatureName} onChange={e=>setSignatureName(e.target.value)} placeholder="Es. Dr. Mario Rossi" style={inp}/></div>
                <div><label style={lbl}>Titolo</label><input value={signatureTitle} onChange={e=>setSignatureTitle(e.target.value)} placeholder="Es. Fisioterapia e Osteopatia" style={inp}/></div>
              </div>
            </div>

            {/* ─── Iscrizione albo professionale (mig. 034) — attestati ─── */}
            <div style={{ marginTop:8, padding:"12px 14px", borderRadius:10, background:THEME.panelSoft, border:`1px solid ${THEME.border}` }}>
              <div style={{ fontSize:12, fontWeight:700, color:THEME.muted, marginBottom:8, letterSpacing:0.3 }}>ISCRIZIONE ALBO PROFESSIONALE</div>
              <div style={{ fontSize:11, color:THEME.muted, lineHeight:1.5, marginBottom:10 }}>
                Usato negli attestati di presenza e nei documenti ufficiali rilasciati ai pazienti.
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div><label style={lbl}>Numero iscrizione albo</label><input value={professionalRegisterNumber} onChange={e=>setProfessionalRegisterNumber(e.target.value)} placeholder="Es. 1234" style={inp}/></div>
                <div><label style={lbl}>Nome albo</label><input value={professionalRegisterName} onChange={e=>setProfessionalRegisterName(e.target.value)} placeholder="TSRM-PSTRP" style={inp}/></div>
              </div>
            </div>

            {/* ─── Logo studio (multi-tenancy) ─── */}
            <div style={{ marginTop:8, padding:"12px 14px", borderRadius:10, background:THEME.panelSoft, border:`1px solid ${THEME.border}` }}>
              <div style={{ fontSize:12, fontWeight:700, color:THEME.muted, marginBottom:8, letterSpacing:0.3 }}>LOGO STUDIO</div>
              <div style={{ fontSize:11, color:THEME.muted, lineHeight:1.5, marginBottom:10 }}>
                Appare nei PDF, ricevute, schede esercizi, link pubblici (portale, conferma, recensioni).
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                {logoBase64 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoBase64} alt="Logo" style={{ height:56, objectFit:"contain", borderRadius:6, border:`1px solid ${THEME.border}`, padding:4, background:"#fff" }} />
                )}
                <label style={{ padding:"10px 14px", borderRadius:8, border:`1.5px solid ${THEME.teal}`, background:"rgba(13,148,136,0.06)", color:THEME.teal, fontWeight:700, fontSize:13, cursor:"pointer", display:"inline-block" }}>
                  {logoBase64 ? "📷 Cambia" : "📷 Carica logo"}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display:"none" }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 200000) { showToast.warning("Logo max 200KB"); return; }
                      const r = new FileReader();
                      r.onload = ev => setLogoBase64(ev.target!.result as string);
                      r.readAsDataURL(file);
                    }}
                  />
                </label>
                {logoBase64 && (
                  <button onClick={() => setLogoBase64("")} style={{ padding:"10px 12px", borderRadius:8, border:`1px solid ${THEME.border}`, background:"transparent", color:THEME.muted, fontWeight:600, fontSize:12, cursor:"pointer" }}>
                    ✕ Rimuovi
                  </button>
                )}
              </div>
              <div style={{ fontSize:10, color:THEME.muted, marginTop:6 }}>Max 200KB · PNG/JPG</div>
            </div>
          </div>
        </Section>

        <div id="msec-fiscale">
          <PracticeSection
            show={showFiscM} onToggle={() => setShowFiscM(!showFiscM)}
            loadingPractice={loadingPractice} savingPractice={savingPractice}
            ownerFullName={ownerFullName} setOwnerFullName={setOwnerFullName}
            vatNumber={vatNumber} setVatNumber={setVatNumber}
            pecEmail={pecEmail} setPecEmail={setPecEmail}
            tsEnabled={tsEnabled} setTsEnabled={setTsEnabled}
            tsTipoSpesaDefault={tsTipoSpesaDefault} setTsTipoSpesaDefault={setTsTipoSpesaDefault}
            tsNumberingMode={tsNumberingMode} setTsNumberingMode={setTsNumberingMode}
            tsCfProprietario={tsCfProprietario} setTsCfProprietario={setTsCfProprietario}
            tsRegimeForfettario={tsRegimeForfettario} setTsRegimeForfettario={setTsRegimeForfettario}
            tsDispositivo={tsDispositivo} setTsDispositivo={setTsDispositivo}
            tsWsUser={tsWsUser} setTsWsUser={setTsWsUser}
            tsWsPassword={tsWsPassword} setTsWsPassword={setTsWsPassword}
            tsWsPincode={tsWsPincode} setTsWsPincode={setTsWsPincode}
            tsWsAmbiente={tsWsAmbiente} setTsWsAmbiente={setTsWsAmbiente}
            tsReminderCadences={tsReminderCadences} setTsReminderCadences={setTsReminderCadences}
            tsInvioEmailEnabled={tsInvioEmailEnabled} setTsInvioEmailEnabled={setTsInvioEmailEnabled}
            tsRecapCadences={tsRecapCadences} setTsRecapCadences={setTsRecapCadences}
            onReload={() => void loadPracticeFull()}
            onSave={() => void savePracticeFull()}
          />
        </div>

        <Section id="sedi" title="📍 Sedi di lavoro" sub={multiLocationEnabled ? `${studioLocations.length} ${studioLocations.length===1?"sede attiva":"sedi attive"}` : "Studio singolo · attiva per gestire più sedi"}>
          <div style={{ display:"flex", flexDirection:"column", gap:14, paddingTop:14 }}>

            {/* Toggle globale */}
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"12px 14px", borderRadius:10,
              background: multiLocationEnabled ? "rgba(37,99,235,0.05)" : "rgba(148,163,184,0.06)",
              border: `1px solid ${multiLocationEnabled ? "rgba(37,99,235,0.2)" : THEME.border}`,
            }}>
              <div style={{ flex:1, paddingRight:12 }}>
                <div style={{ fontSize:13, fontWeight:700, color:THEME.text }}>Più sedi di lavoro</div>
                <div style={{ fontSize:11, color:THEME.muted, marginTop:2, lineHeight:1.4 }}>
                  Quando attivo, in fase di creazione appuntamento puoi scegliere la sede; l&apos;indirizzo viene usato nei promemoria.
                </div>
              </div>
              <label style={{ display:"flex", alignItems:"center", cursor:"pointer", flexShrink:0 }}>
                <input type="checkbox" checked={multiLocationEnabled} onChange={e=>setMultiLocationEnabled(e.target.checked)} style={{ display:"none" }} />
                <span style={{
                  position:"relative", width:44, height:24,
                  background: multiLocationEnabled ? THEME.blue : THEME.gray,
                  borderRadius:99, transition:"background 0.2s",
                }}>
                  <span style={{
                    position:"absolute", top:2,
                    left: multiLocationEnabled ? 22 : 2,
                    width:20, height:20, background:"#fff",
                    borderRadius:99, transition:"left 0.2s",
                    boxShadow:"0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </span>
              </label>
            </div>

            <button
              onClick={()=>void saveMultiToggle()}
              disabled={savingMultiToggle}
              style={{
                padding:"11px 14px", borderRadius:10, border:"none",
                background: savingMultiToggle ? THEME.gray : THEME.gradient,
                color:"#fff", fontWeight:700, fontSize:13,
                cursor: savingMultiToggle ? "not-allowed" : "pointer",
              }}
            >
              {savingMultiToggle ? "Salvataggio…" : "Salva impostazione multi-sede"}
            </button>

            {/* Lista sedi */}
            <div style={{ paddingTop:8, borderTop:`1px dashed ${THEME.border}` }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:10, marginBottom:8 }}>
                <div style={{ fontSize:11, fontWeight:700, color:THEME.text, textTransform:"uppercase", letterSpacing:0.5 }}>
                  Le tue sedi
                </div>
                {multiLocationEnabled && !showAddLocForm && !editingLocId && (
                  <button
                    onClick={()=>{ setShowAddLocForm(true); setEditingLocId(null); setLocFormName(""); setLocFormAddress(""); setLocFormBorderColor("#2563eb"); }}
                    style={{ padding:"6px 12px", fontSize:12, fontWeight:700, background:THEME.gradient, color:"#fff", border:"none", borderRadius:8, cursor:"pointer" }}
                  >
                    + Aggiungi
                  </button>
                )}
              </div>

              {studioLocations.length === 0 && !showAddLocForm && (
                <div style={{ padding:"12px 14px", borderRadius:8, background:"rgba(148,163,184,0.06)", fontSize:12, color:THEME.muted, lineHeight:1.5 }}>
                  Nessuna sede. Verrà creata automaticamente la sede principale al primo salvataggio dei dati studio.
                </div>
              )}

              {studioLocations.map(loc => editingLocId === loc.id ? (
                <div key={loc.id} style={{ background:THEME.panelSoft, border:`1px solid ${THEME.border}`, borderRadius:10, padding:12, marginBottom:8 }}>
                  <div><label style={lbl}>Nome sede *</label><input value={locFormName} onChange={e=>setLocFormName(e.target.value)} style={inp}/></div>
                  <div style={{ marginTop:10 }}><label style={lbl}>Indirizzo</label><input value={locFormAddress} onChange={e=>setLocFormAddress(e.target.value)} style={inp}/></div>
                  <div style={{ marginTop:10 }}>
                    <label style={lbl}>Colore bordo</label>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>
                      {LOC_BORDER_PRESETS.map(p => (
                        <button key={p.value} onClick={()=>setLocFormBorderColor(p.value)} style={{
                          display:"flex", alignItems:"center", gap:5, padding:"6px 9px", borderRadius:7,
                          border: locFormBorderColor===p.value ? `2px solid ${p.value}` : `1px solid ${THEME.border}`,
                          background: locFormBorderColor===p.value ? `${p.value}10` : "#fff",
                          fontSize:11, fontWeight:600, color: locFormBorderColor===p.value ? p.value : THEME.muted,
                          cursor:"pointer",
                        }}>
                          <span style={{ width:12, height:12, borderRadius:3, background:p.value, display:"inline-block" }} />
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, marginTop:12 }}>
                    <button onClick={resetLocForm} style={{ flex:1, padding:"10px", borderRadius:8, border:`1px solid ${THEME.border}`, background:"#fff", color:THEME.muted, fontSize:13, fontWeight:700, cursor:"pointer" }}>Annulla</button>
                    <button onClick={()=>void updateLoc(loc.id)} disabled={savingLocation} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:THEME.gradient, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      {savingLocation ? "Salvo…" : "Salva"}
                    </button>
                  </div>
                </div>
              ) : (
                <div key={loc.id} style={{
                  background:"#fff",
                  border: `${loc.is_primary ? 1 : 2}px solid ${loc.is_primary ? THEME.border : (loc.border_color || THEME.border)}`,
                  borderRadius:10, padding:12, marginBottom:8,
                }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8, flexWrap:"wrap", gap:6 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      {loc.is_primary ? (
                        <span style={{ background:"rgba(37,99,235,0.1)", color:THEME.blue, fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:99, textTransform:"uppercase", letterSpacing:0.5 }}>Principale</span>
                      ) : (
                        <span style={{ background:`${loc.border_color || THEME.gray}15`, color: loc.border_color || THEME.muted, fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:99, textTransform:"uppercase", letterSpacing:0.5 }}>Secondaria</span>
                      )}
                      <span style={{ fontSize:13, fontWeight:700, color:THEME.text }}>{loc.name}</span>
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:THEME.muted, marginBottom:10 }}>
                    {loc.address || <span style={{ fontStyle:"italic" }}>Nessun indirizzo</span>}
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {!loc.is_primary && (
                      <button onClick={()=>void setPrimaryLoc(loc.id)} style={{ padding:"6px 10px", fontSize:11, fontWeight:600, background:"#fff", color:THEME.muted, border:`1px solid ${THEME.border}`, borderRadius:6, cursor:"pointer" }}>
                        Rendi principale
                      </button>
                    )}
                    <button onClick={()=>startEditLoc(loc)} style={{ padding:"6px 10px", fontSize:11, fontWeight:600, background:"#fff", color:THEME.muted, border:`1px solid ${THEME.border}`, borderRadius:6, cursor:"pointer" }}>
                      Modifica
                    </button>
                    {!loc.is_primary && studioLocations.length > 1 && (
                      <button onClick={()=>void deleteLoc(loc.id, loc.name, loc.is_primary)} style={{ padding:"6px 10px", fontSize:11, fontWeight:600, background:"#fff", color:THEME.red, border:`1px solid ${THEME.red}40`, borderRadius:6, cursor:"pointer" }}>
                        Rimuovi
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {showAddLocForm && (
                <div style={{ background:THEME.panelSoft, border:`1px solid ${THEME.border}`, borderRadius:10, padding:12, marginBottom:8 }}>
                  <div><label style={lbl}>Nome sede *</label><input value={locFormName} onChange={e=>setLocFormName(e.target.value)} placeholder="Es. Sede Centro" style={inp}/></div>
                  <div style={{ marginTop:10 }}><label style={lbl}>Indirizzo</label><input value={locFormAddress} onChange={e=>setLocFormAddress(e.target.value)} placeholder="Es. Via Roma 10, 00100 Città" style={inp}/></div>
                  <div style={{ marginTop:10 }}>
                    <label style={lbl}>Colore bordo</label>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>
                      {LOC_BORDER_PRESETS.map(p => (
                        <button key={p.value} onClick={()=>setLocFormBorderColor(p.value)} style={{
                          display:"flex", alignItems:"center", gap:5, padding:"6px 9px", borderRadius:7,
                          border: locFormBorderColor===p.value ? `2px solid ${p.value}` : `1px solid ${THEME.border}`,
                          background: locFormBorderColor===p.value ? `${p.value}10` : "#fff",
                          fontSize:11, fontWeight:600, color: locFormBorderColor===p.value ? p.value : THEME.muted,
                          cursor:"pointer",
                        }}>
                          <span style={{ width:12, height:12, borderRadius:3, background:p.value, display:"inline-block" }} />
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, marginTop:12 }}>
                    <button onClick={resetLocForm} style={{ flex:1, padding:"10px", borderRadius:8, border:`1px solid ${THEME.border}`, background:"#fff", color:THEME.muted, fontSize:13, fontWeight:700, cursor:"pointer" }}>Annulla</button>
                    <button onClick={()=>void createLoc()} disabled={savingLocation} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:THEME.gradient, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      {savingLocation ? "Salvo…" : "Aggiungi"}
                    </button>
                  </div>
                </div>
              )}

              {!multiLocationEnabled && studioLocations.length > 0 && (
                <div style={{ marginTop:8, padding:"10px 12px", borderRadius:8, background:"rgba(148,163,184,0.06)", border:`1px solid ${THEME.border}`, fontSize:11, color:THEME.muted, lineHeight:1.5 }}>
                  ℹ️ Multi-sede disattivato: tutti gli appuntamenti useranno la sede principale.
                </div>
              )}
            </div>

          </div>
        </Section>

        {/* ── Convenzioni (mig. 065) ───────────────────────────────── */}
        <Section
          id="convenzioni"
          title="🏥 Convenzioni"
          sub={convEnabled ? "Modulo attivo · menu in alto a destra" : "Spento · attiva se lavori con fondi o assicurazioni"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 14 }}>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(148,163,184,0.06)", fontSize: 11, color: THEME.muted, lineHeight: 1.5 }}>
              Fondi sanitari, casse e assicurazioni: anagrafica enti con registro precaricato, listini
              (anche da foto o PDF del nomenclatore) e sedute da fatturare a fine mese.
              Da spento non compare nessun campo in più da nessuna parte.
            </div>

            <MobileToggle
              label="Attiva convenzioni"
              description={convEnabled ? "Modulo attivo" : "Modulo spento"}
              checked={convEnabled}
              onChange={setConvEnabled}
            />
            <button
              onClick={() => void saveConvToggle()}
              disabled={savingConv}
              style={{
                padding: "10px 16px", borderRadius: 10, border: "none",
                background: savingConv ? THEME.gray : THEME.gradient,
                color: "#fff", fontWeight: 700, fontSize: 13,
                cursor: savingConv ? "default" : "pointer", fontFamily: "inherit",
              }}
            >{savingConv ? "Salvo…" : "Salva"}</button>

            {convEnabled && (
              <a href="/convenzioni" style={{
                padding: "10px 16px", borderRadius: 10, textAlign: "center",
                border: `1.5px solid ${THEME.border}`, background: "#fff",
                color: THEME.text, fontWeight: 700, fontSize: 13, textDecoration: "none",
              }}>Apri Convenzioni →</a>
            )}
          </div>
        </Section>

        {/* ── Professionisti ospiti (mig. 029-031) ─────────────────── */}
        <Section
          id="ospiti"
          title="🩺 Professionisti ospiti"
          sub={guestEnabled
            ? `${guestsList.filter(g => g.is_active).length} ${guestsList.filter(g => g.is_active).length === 1 ? "ospite attivo" : "ospiti attivi"}`
            : "Disattivati · attiva per registrare collaboratori esterni"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 14 }}>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(148,163,184,0.06)", fontSize: 11, color: THEME.muted, lineHeight: 1.5 }}>
              Registra professionisti esterni (es. ortopedico, nutrizionista) che lavorano occasionalmente nello studio.
              Gli appuntamenti dei loro pazienti NON entrano nei tuoi incassi né nel tuo calendario.
              Li gestisci da una sezione dedicata (menu utente → Agenda Ospiti).
            </div>

            {/* Toggle feature ON/OFF */}
            <MobileToggle
              label="Attiva professionisti ospiti"
              description={guestEnabled ? "Feature attiva" : "Feature disattivata"}
              checked={guestEnabled}
              onChange={setGuestEnabled}
            />
            <button
              onClick={() => void saveGuestToggle()}
              disabled={savingGuestToggle}
              style={{
                padding: "10px 16px", borderRadius: 10, border: "none",
                background: savingGuestToggle ? THEME.gray : THEME.gradient,
                color: "#fff", fontSize: 13, fontWeight: 800,
                cursor: savingGuestToggle ? "not-allowed" : "pointer",
              }}
            >
              {savingGuestToggle ? "Salvataggio..." : "Salva impostazione"}
            </button>

            {guestEnabled && (
              <>
                <div style={{ height: 1, background: THEME.border, margin: "6px 0" }} />

                {/* Lista ospiti */}
                <div style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>
                  Registrati ({guestsList.length})
                </div>

                {loadingGuests ? (
                  <div style={{ padding: 14, textAlign: "center", color: THEME.muted, fontSize: 12 }}>
                    Caricamento...
                  </div>
                ) : guestsList.length === 0 ? (
                  <div style={{
                    padding: 16, textAlign: "center",
                    background: "rgba(148,163,184,0.04)", borderRadius: 10,
                    fontSize: 12, color: THEME.muted, lineHeight: 1.5,
                  }}>
                    Nessun professionista registrato.<br />
                    Aggiungilo qui sotto.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {guestsList.map(g => (
                      <div
                        key={g.id}
                        style={{
                          background: "#fff", border: `1px solid ${THEME.border}`,
                          borderLeft: `4px solid ${g.display_color || "#DB2777"}`,
                          borderRadius: 10, padding: "12px 14px",
                          opacity: g.is_active ? 1 : 0.55,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: THEME.text }}>
                              {g.first_name} {g.last_name}
                            </div>
                            <div style={{ fontSize: 11, color: THEME.muted, marginTop: 1, fontWeight: 600 }}>
                              {g.specialty}
                              {g.access_token && <span style={{ marginLeft: 8, color: THEME.green }}>· 🔗 Portale attivo</span>}
                              {!g.is_active && <span style={{ marginLeft: 8, color: THEME.red }}>· Disattivato</span>}
                            </div>
                          </div>
                          <Link
                            href={`/ospiti/${g.id}`}
                            style={{
                              padding: "6px 12px", borderRadius: 8,
                              background: THEME.gradient, color: "#fff",
                              fontSize: 11, fontWeight: 800, textDecoration: "none",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Agenda →
                          </Link>
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                          <button
                            onClick={() => setEditingGuest(g)}
                            style={{
                              flex: 1, padding: "7px 10px", borderRadius: 8,
                              border: `1px solid ${THEME.teal}`, background: "#fff",
                              fontSize: 11, fontWeight: 800, color: THEME.teal,
                              cursor: "pointer",
                            }}
                          >
                            Modifica
                          </button>
                          <button
                            onClick={() => void toggleGuestActive(g)}
                            style={{
                              flex: 1, padding: "7px 10px", borderRadius: 8,
                              border: `1px solid ${THEME.border}`, background: "#fff",
                              fontSize: 11, fontWeight: 700, color: THEME.muted,
                              cursor: "pointer",
                            }}
                          >
                            {g.is_active ? "Disattiva" : "Riattiva"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pulsante / form Aggiungi */}
                {!showNewGuestForm ? (
                  <button
                    onClick={() => setShowNewGuestForm(true)}
                    style={{
                      padding: "10px 16px", borderRadius: 10, border: `1px dashed ${THEME.border}`,
                      background: "rgba(13,148,136,0.03)", color: THEME.teal,
                      fontSize: 13, fontWeight: 800, cursor: "pointer",
                    }}
                  >
                    + Aggiungi professionista
                  </button>
                ) : (
                  <div style={{
                    background: "#fff", border: `1.5px solid ${THEME.teal}`,
                    borderRadius: 10, padding: 14,
                    display: "flex", flexDirection: "column", gap: 10,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>
                      Nuovo professionista
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 800, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Nome *</label>
                        <input
                          value={newGuestFirstName}
                          onChange={e => setNewGuestFirstName(e.target.value)}
                          style={{
                            width: "100%", padding: "8px 10px", borderRadius: 8,
                            border: `1px solid ${THEME.border}`, fontSize: 13,
                            color: THEME.text, fontWeight: 600, outline: "none",
                            marginTop: 4,
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 800, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Cognome *</label>
                        <input
                          value={newGuestLastName}
                          onChange={e => setNewGuestLastName(e.target.value)}
                          style={{
                            width: "100%", padding: "8px 10px", borderRadius: 8,
                            border: `1px solid ${THEME.border}`, fontSize: 13,
                            color: THEME.text, fontWeight: 600, outline: "none",
                            marginTop: 4,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 800, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Specialità *</label>
                      <input
                        value={newGuestSpecialty}
                        onChange={e => setNewGuestSpecialty(e.target.value)}
                        placeholder="Es. Ortopedico, Nutrizionista..."
                        style={{
                          width: "100%", padding: "8px 10px", borderRadius: 8,
                          border: `1px solid ${THEME.border}`, fontSize: 13,
                          color: THEME.text, fontWeight: 600, outline: "none",
                          marginTop: 4,
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 800, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "block" }}>Colore</label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {GUEST_COLOR_PRESETS.map(c => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setNewGuestColor(c.value)}
                            style={{
                              width: 32, height: 32, borderRadius: "50%",
                              background: c.value, cursor: "pointer",
                              border: newGuestColor === c.value ? "3px solid #fff" : "2px solid transparent",
                              boxShadow: newGuestColor === c.value ? `0 0 0 2px ${c.value}` : "none",
                            }}
                            aria-label={c.name}
                          />
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <button
                        onClick={resetNewGuestForm}
                        disabled={savingNewGuest}
                        style={{
                          flex: 1, padding: "9px 14px", borderRadius: 8,
                          border: `1px solid ${THEME.border}`, background: "#fff",
                          fontSize: 12, fontWeight: 800, color: THEME.muted,
                          cursor: "pointer",
                        }}
                      >
                        Annulla
                      </button>
                      <button
                        onClick={() => void createNewGuest()}
                        disabled={savingNewGuest}
                        style={{
                          flex: 1, padding: "9px 14px", borderRadius: 8,
                          border: "none", background: THEME.gradient, color: "#fff",
                          fontSize: 12, fontWeight: 800,
                          cursor: savingNewGuest ? "not-allowed" : "pointer",
                          opacity: savingNewGuest ? 0.6 : 1,
                        }}
                      >
                        {savingNewGuest ? "Salvataggio..." : "Aggiungi"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Toggle pagina indice (solo se 2+ ospiti) */}
                {guestsList.length >= 2 && (
                  <>
                    <div style={{ height: 1, background: THEME.border, margin: "6px 0" }} />
                    <MobileToggle
                      label="Pagina indice ospiti"
                      description="Voce menu apre una pagina dedicata con tutti i tuoi ospiti, invece del submenu"
                      checked={useGuestIndex}
                      onChange={setUseGuestIndex}
                    />
                    <button
                      onClick={() => void saveGuestIndexToggle()}
                      disabled={savingGuestIndexToggle}
                      style={{
                        padding: "10px 16px", borderRadius: 10, border: "none",
                        background: savingGuestIndexToggle ? THEME.gray : THEME.gradient,
                        color: "#fff", fontSize: 13, fontWeight: 800,
                        cursor: savingGuestIndexToggle ? "not-allowed" : "pointer",
                      }}
                    >
                      {savingGuestIndexToggle ? "Salvataggio..." : "Salva preferenza indice"}
                    </button>
                  </>
                )}

                <div style={{
                  marginTop: 6, padding: "10px 12px", borderRadius: 8,
                  background: "rgba(37,99,235,0.06)", fontSize: 11,
                  color: THEME.muted, lineHeight: 1.5,
                }}>
                  💡 Tap <strong>Modifica</strong> su un ospite per configurare colore, stanza predefinita, campi del PDF, e generare il <strong>link portale pubblico</strong>.
                </div>
              </>
            )}
          </div>
        </Section>

        <div id="msec-team">
          <TeamSection
            show={showTeamM} onToggle={() => setShowTeamM(!showTeamM)}
            studioId={currentStudioId ?? ""}
            multiOperatorEnabled={multiOperatorEnabled} setMultiOperatorEnabled={setMultiOperatorEnabled}
            savingMultiToggle={savingMultiOpToggle} onSaveMultiToggle={() => void saveMultiOperatorToggle()}
            members={members} currentUserId={mobUserId}
            loadingMembers={loadingMembers} savingMember={savingMember}
            onCreateInvite={createInvite} onUpdateMember={updateMember} onDeleteMember={deleteMember}
            weeklyViewLayout={weeklyViewLayout} setWeeklyViewLayout={setWeeklyViewLayout}
            savingWeeklyLayout={savingWeeklyLayout} onSaveWeeklyLayout={() => void saveWeeklyLayout()}
          />
        </div>

        <div id="msec-stanze">
          <RoomsSection
            show={showRoomsM} onToggle={() => setShowRoomsM(!showRoomsM)}
            multiRoomEnabled={multiRoomEnabled} setMultiRoomEnabled={setMultiRoomEnabled}
            savingMultiToggle={savingMultiRoomToggle} onSaveMultiToggle={() => void saveMultiRoomToggle()}
            rooms={rooms} locations={studioLocations as StudioLocation[]}
            treatments={allTreatments}
            loadingRooms={loadingRooms} savingRoom={savingRoom}
            onCreate={createRoom} onUpdate={updateRoom} onDelete={deleteRoom}
          />
        </div>

        <div id="msec-assenze">
          <OperatorAbsencesSection
            show={showAbsM} onToggle={() => setShowAbsM(!showAbsM)}
            studioId={currentStudioId ?? ""}
            members={members}
          />
        </div>

        <Section id="notifiche" title="🔔 Notifiche pazienti" sub="Conferme e annullamenti dal link WhatsApp">
          <div style={{ display:"flex", flexDirection:"column", gap:10, paddingTop:14 }}>
            <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(148,163,184,0.06)", fontSize:11, color:THEME.muted, lineHeight:1.5 }}>
              Quando un paziente conferma o annulla un appuntamento dal link che gli invii, scegli come venire avvisato.
            </div>
            <MobileToggle
              label="Campanella nel calendario"
              description="Mostra le notifiche con un badge nel calendario"
              checked={notifyBellEnabled}
              onChange={setNotifyBellEnabled}
            />
            <MobileToggle
              label="Email allo studio"
              description="Invia email all'indirizzo email dello studio"
              checked={notifyEmailEnabled}
              onChange={setNotifyEmailEnabled}
            />
            <MobileToggle
              label="WhatsApp di ritorno"
              description="Quando il paziente annulla, gli proponi di avvisarti su WhatsApp"
              checked={notifyWaRedirectEnabled}
              onChange={setNotifyWaRedirectEnabled}
            />
          </div>
        </Section>

        <Section id="report" title="Report automatici" sub="Riepiloghi PDF via email">
          <div style={{ display:"flex", flexDirection:"column", gap:10, paddingTop:14 }}>
            <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(148,163,184,0.06)", fontSize:11, color:THEME.muted, lineHeight:1.5 }}>
              Ricevi un riepilogo PDF con sedute, incassi e nuovi pazienti. Ogni cadenza è indipendente.
            </div>
            <MobileToggle
              label="Report mensile"
              description="Il 1° di ogni mese, mese precedente"
              checked={reportMonthlyEnabled}
              onChange={setReportMonthlyEnabled}
            />
            <MobileToggle
              label="Report trimestrale"
              description="A inizio gennaio, aprile, luglio e ottobre"
              checked={reportQuarterlyEnabled}
              onChange={setReportQuarterlyEnabled}
            />
            <MobileToggle
              label="Report annuale"
              description="Il 1° gennaio, anno appena concluso"
              checked={reportYearlyEnabled}
              onChange={setReportYearlyEnabled}
            />
            <div style={{ marginTop:6 }}>
              <label style={{ display:"block", fontSize:12.5, fontWeight:700, color:THEME.text, marginBottom:5 }}>
                Invia i report a
              </label>
              <input
                type="email"
                value={reportEmail}
                onChange={e => setReportEmail(e.target.value)}
                placeholder="Vuoto = la tua email di accesso"
                style={{ width:"100%", boxSizing:"border-box", padding:"11px 12px", borderRadius:9,
                  border:`1px solid ${THEME.border}`, fontSize:15, fontFamily:"inherit", color:THEME.text }}
              />
              <div style={{ fontSize:11, color:THEME.muted, marginTop:5, lineHeight:1.5 }}>
                Se vuoto arrivano all'indirizzo con cui accedi. Puoi indicarne un altro.
              </div>
            </div>
            <button onClick={saveReportSettings} disabled={savingReport}
              style={{ marginTop:6, padding:"12px", borderRadius:10, border:"none",
                background:"linear-gradient(135deg,#0d9488,#2563eb)", color:"#fff", fontWeight:800,
                fontSize:14, cursor: savingReport ? "wait" : "pointer", fontFamily:"inherit", opacity: savingReport ? 0.7 : 1 }}>
              {savingReport ? "Salvataggio…" : "Salva impostazioni report"}
            </button>
          </div>
        </Section>

        <div id="msec-template">
          <TemplatesSection
            show={showTemplM} onToggle={() => setShowTemplM(!showTemplM)}
            loadingTemplates={loadingTemplates} savingPractice={savingPractice}
            templates={templates} dynamicSignature={dynamicSignature}
            editingId={editingId} setEditingId={setEditingId}
            editName={editName} setEditName={setEditName}
            editTemplate={editTemplate} setEditTemplate={setEditTemplate}
            newName={newName} setNewName={setNewName}
            newTemplate={newTemplate} setNewTemplate={setNewTemplate}
            addingNew={addingNew} setAddingNew={setAddingNew}
            onSaveTemplate={id => void saveTemplate(id)}
            onDeleteTemplate={id => void deleteTemplate(id)}
            onSetAsDefault={id => void setAsDefault(id)}
            onCreateNewTemplate={() => void createNewTemplate()}
            welcomeMsg={welcomeMsg} setWelcomeMsg={setWelcomeMsg}
            bookingConfirmMsg={bookingConfirmMsg} setBookingConfirmMsg={setBookingConfirmMsg}
            reminderMsg={reminderMsg} setReminderMsg={setReminderMsg}
            weeklyReminderMsg={weeklyReminderMsg} setWeeklyReminderMsg={setWeeklyReminderMsg}
            paymentMsg={paymentMsg} setPaymentMsg={setPaymentMsg}
            birthdayMsg={birthdayMsg} setBirthdayMsg={setBirthdayMsg}
            satisfactionMsg={satisfactionMsg} setSatisfactionMsg={setSatisfactionMsg}
            onSaveAutoMessages={() => void saveAutoMessages()}
          />
        </div>

        <div id="msec-integrazioni">
          <IntegrationsSection
            show={showIntegrM} onToggle={() => setShowIntegrM(!showIntegrM)}
            exportingBackup={exportingBackup} onExportBackup={() => void exportBackup()}
            calendarToken={calendarToken} calendarTokenLoading={calendarTokenLoading}
            calendarTokenRotating={calendarTokenRotating}
            onRotateToken={() => void rotateCalendarToken()}
            onCopyLink={copyCalendarLink}
          />
        </div>

        <Section id="booking-legacy" title="🌐 Prenotazioni dal sito" sub="Funzionalità per studi con sito pubblico">
          <div style={{ display:"flex", flexDirection:"column", gap:10, paddingTop:14 }}>
            <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(148,163,184,0.06)", fontSize:11, color:THEME.muted, lineHeight:1.5 }}>
              Funzionalità per studi con sito pubblico che riceve prenotazioni online. Disattiva per nascondere la UI dal gestionale (la feature continua a funzionare sul backend).
            </div>
            <MobileToggle
              label="Card in home"
              description="Mostra la card 'Prenotazioni dal sito' nella home"
              checked={showBookingCardHome}
              onChange={setShowBookingCardHome}
            />
            <MobileToggle
              label="Campanella nel calendario"
              description="Mostra la campanella arancione delle prenotazioni nel calendario"
              checked={showBookingBellCalendar}
              onChange={setShowBookingBellCalendar}
            />
          </div>
        </Section>

        <div id="msec-servizi">
          <BookableServicesSection
            show={showSvcM} onToggle={() => setShowSvcM(!showSvcM)}
            loadingServices={loadingServices} savingSvc={savingSvc}
            services={services}
            newSvcName={newSvcName} setNewSvcName={setNewSvcName}
            newSvcDuration={newSvcDuration} setNewSvcDuration={setNewSvcDuration}
            newSvcPrice={newSvcPrice} setNewSvcPrice={setNewSvcPrice}
            onAdd={() => void addService()}
            onDelete={id => void deleteService(id)}
          />
        </div>

        <Section
          id="catalogo"
          title="Catalogo Trattamenti"
          sub={loadingTreatments ? "Caricamento…" : `${treatments.filter(t=>t.is_active).length} attivi · ${treatments.length} totali`}
        >
          <div style={{ display:"flex", flexDirection:"column", gap:10, paddingTop:14 }}>
            <div style={{ fontSize:12, color:THEME.muted, lineHeight:1.5 }}>
              Aggiungi nuovi tipi di trattamento, modifica nome/prezzo/durata, riordina o disattiva quelli che non usi. Le modifiche valgono ovunque (calendario, ricevute, report).
            </div>

            <button
              onClick={openNewTreatment}
              disabled={!currentStudioId || savingTreatment}
              style={{
                width:"100%", padding:"12px", borderRadius:10, border:"none",
                background:THEME.gradient, color:"#fff", fontWeight:700, fontSize:14,
                cursor:"pointer", opacity:(!currentStudioId||savingTreatment)?0.6:1,
              }}
            >
              + Nuovo trattamento
            </button>

            {treatments.length === 0 && !loadingTreatments && (
              <div style={{ padding:20, textAlign:"center", color:THEME.muted, fontSize:13, border:`1px dashed ${THEME.border}`, borderRadius:10 }}>
                Nessun trattamento configurato. Tocca <b>+ Nuovo trattamento</b> per aggiungerne uno.
              </div>
            )}

            {[...treatments].sort((a,b)=>a.sort_order-b.sort_order).map((row, idx, sorted) => (
              <div
                key={row.id}
                style={{
                  display:"flex", alignItems:"center", gap:10,
                  padding:"12px", borderRadius:10,
                  border:`1px solid ${THEME.border}`,
                  background: row.is_active ? "#fff" : THEME.appBg,
                  opacity: row.is_active ? 1 : 0.65,
                }}
              >
                {/* Frecce ordinamento */}
                <div style={{ display:"flex", flexDirection:"column", gap:1, marginRight:2 }}>
                  <button
                    onClick={()=>void moveTreatment(row, -1)}
                    disabled={idx===0 || savingTreatment}
                    style={{ background:"none", border:"none", cursor: idx===0 ? "default" : "pointer", color: idx===0 ? THEME.gray : THEME.muted, fontSize:14, padding:"2px 6px", lineHeight:1 }}
                    aria-label="Sposta su"
                  >▲</button>
                  <button
                    onClick={()=>void moveTreatment(row, 1)}
                    disabled={idx===sorted.length-1 || savingTreatment}
                    style={{ background:"none", border:"none", cursor: idx===sorted.length-1 ? "default" : "pointer", color: idx===sorted.length-1 ? THEME.gray : THEME.muted, fontSize:14, padding:"2px 6px", lineHeight:1 }}
                    aria-label="Sposta giù"
                  >▼</button>
                </div>

                {/* Pallino colore */}
                <div style={{ width:14, height:14, borderRadius:"50%", background:row.color, flexShrink:0, border:"1px solid rgba(0,0,0,0.06)" }} />

                {/* Info trattamento (toccabile per modifica) */}
                <div
                  onClick={()=>openEditTreatment(row)}
                  style={{ flex:1, minWidth:0, cursor:"pointer" }}
                >
                  <div style={{ fontWeight:700, fontSize:14, color:THEME.text, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                    <span>{row.label}</span>
                    {row.is_builtin && (
                      <span style={{ fontSize:9, fontWeight:700, padding:"2px 5px", borderRadius:4, background:"#EDE6D8", color:THEME.muted, letterSpacing:0.3 }}>SIST</span>
                    )}
                    {!row.is_active && (
                      <span style={{ fontSize:9, fontWeight:700, padding:"2px 5px", borderRadius:4, background:"#fee2e2", color:THEME.red, letterSpacing:0.3 }}>OFF</span>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:THEME.muted, marginTop:2 }}>
                    €{row.price_invoice} fatt · €{row.price_cash} contanti · {row.duration_min} min
                  </div>
                </div>

                {/* Switch attivo */}
                <button
                  onClick={()=>void toggleTreatmentActive(row)}
                  disabled={savingTreatment}
                  aria-label={row.is_active ? "Disattiva" : "Attiva"}
                  style={{
                    width:42, height:24, borderRadius:12, border:"none",
                    background: row.is_active ? THEME.teal : THEME.gray,
                    position:"relative", cursor:"pointer", flexShrink:0,
                    transition:"background 0.15s",
                  }}
                >
                  <span style={{
                    position:"absolute", top:2, left: row.is_active ? 20 : 2,
                    width:20, height:20, borderRadius:"50%", background:"#fff",
                    transition:"left 0.15s",
                  }} />
                </button>

                {/* Cestino */}
                <button
                  onClick={()=>void deleteTreatment(row)}
                  disabled={savingTreatment}
                  aria-label="Cancella"
                  style={{ padding:"8px 10px", borderRadius:8, border:`1px solid ${THEME.border}`, background:"#fff", color:THEME.red, fontSize:14, cursor:"pointer", flexShrink:0 }}
                >🗑</button>
              </div>
            ))}
          </div>
        </Section>

        <Section id="orari" title="Orari di Lavoro" sub={`${hours.filter(h=>h.is_open).length} giorni aperti`}>
          <div style={{ display:"flex", flexDirection:"column", gap:8, paddingTop:14 }}>
            {DAY_ORDER.map(d=>{
              const h = hours.find(x=>x.day_of_week===d);
              if(!h) return null;
              return (
                <div key={d} style={{ padding:"12px 14px", borderRadius:10, border:`1px solid ${THEME.border}`, background:h.is_open?"#fff":THEME.appBg, opacity:h.is_open?1:0.6 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:h.is_open?10:0 }}>
                    <span style={{ fontWeight:700, fontSize:14, color:THEME.text }}>{DAY_LABELS[d]}</span>
                    <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                      <input type="checkbox" checked={h.is_open} onChange={e=>setHours(prev=>prev.map(r=>r.day_of_week===d?{...r,is_open:e.target.checked}:r))} style={{ width:18, height:18, accentColor:THEME.teal, cursor:"pointer" }}/>
                      <span style={{ fontSize:13, fontWeight:700, color:h.is_open?THEME.teal:THEME.muted }}>{h.is_open?"Aperto":"Chiuso"}</span>
                    </label>
                  </div>
                  {h.is_open && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                      <div><label style={lbl}>Apertura</label><input type="time" value={h.open_time} onChange={e=>setHours(prev=>prev.map(r=>r.day_of_week===d?{...r,open_time:e.target.value}:r))} style={{ ...inp, padding:"9px 12px" }}/></div>
                      <div><label style={lbl}>Chiusura</label><input type="time" value={h.close_time} onChange={e=>setHours(prev=>prev.map(r=>r.day_of_week===d?{...r,close_time:e.target.value}:r))} style={{ ...inp, padding:"9px 12px" }}/></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <div id="msec-agenda">
          <AgendaViewPrefsSection
            slotValue={mobSlotMin}
            slotSaving={savingMobSlot}
            onSaveSlot={v => void saveMobSlot(v)}
            viewValue={defaultCalendarView}
            setViewValue={setDefaultCalendarView}
            viewSaving={savingDefaultCalendarView}
            onSaveView={() => void saveDefaultCalendarViewM()}
          />
        </div>

        <div id="msec-calprefs">
          <CalendarPrefsSection
            show={showCalPrefsM} onToggle={() => setShowCalPrefsM(!showCalPrefsM)}
            loadingPractice={loadingPractice} savingPractice={savingPractice}
            defaultApptStatus={defaultApptStatus} setDefaultApptStatus={setDefaultApptStatus}
            overlapMode={overlapMode} setOverlapMode={setOverlapMode}
            autoApplyPrices={autoApplyPrices} setAutoApplyPrices={setAutoApplyPrices}
            defaultGroupPrice={defaultGroupPrice} setDefaultGroupPrice={setDefaultGroupPrice}
            defaultGroupMaxParticipants={defaultGroupMaxParticipants} setDefaultGroupMaxParticipants={setDefaultGroupMaxParticipants}
            groupStatsCountAsSeparate={groupStatsCountAsSeparate} setGroupStatsCountAsSeparate={setGroupStatsCountAsSeparate}
            onSaveGroupStats={() => void saveGroupStats()} savingGroupStats={savingGroupStats}
            onSave={() => void savePracticeFull()}
          />
        </div>

        <div id="msec-chiusure">
          <BlockedDaysSection
            show={showBlockM} onToggle={() => setShowBlockM(!showBlockM)}
            savingBlock={savingBlock} blockDays={blockDays}
            newBlockDate={newBlockDate} setNewBlockDate={setNewBlockDate}
            newBlockLabel={newBlockLabel} setNewBlockLabel={setNewBlockLabel}
            onAdd={() => void addBlockDay()}
            onDelete={id => void deleteBlockDay(id)}
          />
        </div>

        <div id="msec-gestione">
          <ManagementSection
            show={showGestM} onToggle={() => setShowGestM(!showGestM)}
            savingPractice={savingPractice}
            inactiveThresh={inactiveThresh} setInactiveThresh={setInactiveThresh}
            reminderHours={reminderHours} setReminderHours={setReminderHours}
            onSave={() => void savePracticeFull()}
          />
        </div>

        <div id="msec-pagamenti">
          <AccountingSection
            show={showPayM} onToggle={() => setShowPayM(!showPayM)}
            savingPractice={savingPractice}
            paymentMethodRequired={paymentMethodRequired} setPaymentMethodRequired={setPaymentMethodRequired}
            defaultPaymentMethod={defaultPaymentMethod} setDefaultPaymentMethod={setDefaultPaymentMethod}
            monthlyGoal={monthlyGoal} setMonthlyGoal={setMonthlyGoal}
            onSave={() => void savePracticeFull()}
          />
        </div>

        <Section id="privacy" title="Modalità Privacy" sub="Nasconde i nomi dei pazienti negli screenshot">
          <div style={{ display:"flex", flexDirection:"column", gap:12, paddingTop:14 }}>
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"space-between", gap:14,
              padding:"14px 16px", borderRadius:12,
              background: privacyMode ? "rgba(13,148,136,0.08)" : THEME.panelSoft,
              border:`1px solid ${privacyMode ? "rgba(13,148,136,0.28)" : THEME.border}`,
              transition:"all 0.2s",
            }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:14.5, color:THEME.text }}>
                  {privacyMode ? "Attiva" : "Disattivata"}
                </div>
                <div style={{ fontSize:12.5, color:THEME.muted, marginTop:3, lineHeight:1.5 }}>
                  {privacyMode
                    ? (privacyStyle === "initials"
                        ? 'A video compaiono le iniziali (es. "M.R.").'
                        : 'A video compare "Paziente" al posto del nome.')
                    : "I nomi dei pazienti sono visibili normalmente."}
                </div>
              </div>
              <button
                role="switch"
                aria-checked={privacyMode}
                aria-label="Attiva o disattiva la modalità privacy"
                disabled={!privacyHydrated}
                onClick={()=>setPrivacyMode(!privacyMode)}
                style={{
                  position:"relative", width:52, height:30, flexShrink:0,
                  borderRadius:999, border:"none",
                  cursor: privacyHydrated ? "pointer" : "wait",
                  background: privacyMode ? THEME.teal : THEME.gray,
                  transition:"background 0.2s", padding:0,
                }}
              >
                <span style={{
                  position:"absolute", top:3, left: privacyMode ? 25 : 3,
                  width:24, height:24, borderRadius:"50%", background:"#fff",
                  boxShadow:"0 1px 3px rgba(0,0,0,0.25)", transition:"left 0.2s",
                }}/>
              </button>
            </div>

            {privacyMode && (
              <div>
                <div style={{ fontSize:12.5, fontWeight:700, color:THEME.text, marginBottom:8 }}>
                  Come mostrare i pazienti
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  {([
                    { value:"generic" as PrivacyStyle, label:"Paziente", sub:"Uguale per tutti" },
                    { value:"initials" as PrivacyStyle, label:"Iniziali", sub:'Es. "M.R."' },
                  ]).map(opt=>{
                    const selected = privacyStyle === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={()=>setPrivacyStyle(opt.value)}
                        style={{
                          flex:1, textAlign:"left", padding:"10px 12px", borderRadius:10,
                          border:`1.5px solid ${selected ? THEME.teal : THEME.border}`,
                          background: selected ? "rgba(13,148,136,0.07)" : THEME.panelBg,
                          cursor:"pointer", transition:"all 0.15s",
                        }}
                      >
                        <div style={{ fontWeight:700, fontSize:13, color: selected ? THEME.teal : THEME.text }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize:11, color:THEME.muted, marginTop:1 }}>
                          {opt.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{
              padding:"11px 14px", borderRadius:10,
              background:"rgba(37,99,235,0.05)", border:"1px solid rgba(37,99,235,0.15)",
              fontSize:12.5, color:THEME.muted, lineHeight:1.55,
            }}>
              Filtro solo visivo: i dati dei pazienti non vengono toccati.
              Disattivandolo i nomi tornano subito visibili. Vale solo su questo dispositivo.
            </div>
          </div>
        </Section>

        <Section id="password" title="Cambio Password" sub="Aggiorna le credenziali di accesso">
          <div style={{ display:"flex", flexDirection:"column", gap:12, paddingTop:14 }}>
            {pwError && <div style={{ padding:"9px 14px", borderRadius:8, background:"rgba(220,38,38,0.05)", border:"1px solid rgba(220,38,38,0.2)", color:THEME.red, fontWeight:600, fontSize:13 }}>{pwError}</div>}
            {pwSuccess && <div style={{ padding:"9px 14px", borderRadius:8, background:"rgba(22,163,74,0.06)", border:"1px solid rgba(22,163,74,0.2)", color:THEME.green, fontWeight:600, fontSize:13 }}>{pwSuccess}</div>}
            <div><label style={lbl}>Nuova password</label><input type="password" value={pwNew} onChange={e=>setPwNew(e.target.value)} placeholder="Minimo 8 caratteri" style={inp}/></div>
            <div><label style={lbl}>Conferma password</label><input type="password" value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)} placeholder="Ripeti la nuova password" style={inp}/></div>
            <button onClick={changePassword} disabled={pwSaving||!pwNew||!pwConfirm} style={{ padding:"13px", borderRadius:10, border:"none", background:THEME.blue, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", opacity:pwSaving?0.6:1 }}>
              {pwSaving?"Aggiornamento…":"Aggiorna password"}
            </button>
          </div>
        </Section>

        {/* Salva tutto */}
        <button onClick={save} disabled={saving} style={{ width:"100%", padding:"16px", borderRadius:14, border:"none", background:THEME.gradient, color:"#fff", fontWeight:800, fontSize:15, cursor:saving?"wait":"pointer", opacity:saving?0.7:1, marginBottom:12 }}>
          {saving?"Salvataggio in corso…":"💾 Salva tutte le impostazioni"}
        </button>

        <div style={{ textAlign:"center", fontSize:11, color:THEME.gray, paddingBottom:8 }}>FisioHub · {new Date().getFullYear()}</div>
      </div>

      {/* Modal Catalogo Trattamenti (fullscreen) */}
      {treatmentModalOpen && editingTreatment && (
        <div
          style={{
            position:"fixed", inset:0, background:"#fff", zIndex:50,
            display:"flex", flexDirection:"column",
            animation:"slideUp 0.18s ease-out",
          }}
        >
          <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

          {/* Header modal */}
          <div style={{ background:THEME.gradient, padding:"14px 18px", display:"flex", alignItems:"center", gap:12 }}>
            <button
              onClick={closeTreatmentModal}
              style={{ background:"rgba(255,255,255,0.2)", border:"1.5px solid rgba(255,255,255,0.3)", borderRadius:8, color:"#fff", fontWeight:700, fontSize:18, cursor:"pointer", padding:"4px 12px", lineHeight:1 }}
            >×</button>
            <div style={{ fontWeight:800, fontSize:16, color:"#fff" }}>
              {editingTreatment.id ? "Modifica trattamento" : "Nuovo trattamento"}
            </div>
          </div>

          {/* Body modal scrollable */}
          <div style={{ flex:1, overflowY:"auto", padding:"18px", paddingBottom:100 }}>
            {error && (
              <div style={{ marginBottom:14, padding:"10px 14px", borderRadius:10, background:"rgba(220,38,38,0.06)", border:"1px solid rgba(220,38,38,0.2)", color:THEME.red, fontWeight:600, fontSize:13 }}>{error}</div>
            )}

            {editingTreatment.isBuiltin && (
              <div style={{ marginBottom:14, padding:"10px 14px", borderRadius:10, background:"#FAF7F2", border:`1px solid ${THEME.border}`, color:THEME.muted, fontSize:12 }}>
                Voce di sistema — puoi modificare tutto.
              </div>
            )}

            {/* Nome */}
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>Nome trattamento</label>
              <input
                value={editingTreatment.label}
                onChange={e=>setEditingTreatment(prev=>prev ? {...prev, label:e.target.value} : prev)}
                placeholder="Es. Linfodrenaggio Vodder"
                style={inp}
                disabled={savingTreatment}
              />
            </div>

            {/* Colore */}
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>Colore</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginTop:4 }}>
                {COLOR_PALETTE.map(c => {
                  const selected = editingTreatment.color === c.value;
                  return (
                    <button
                      key={c.value}
                      onClick={()=>setEditingTreatment(prev=>prev ? {...prev, color:c.value} : prev)}
                      title={c.name}
                      disabled={savingTreatment}
                      style={{
                        width:36, height:36, borderRadius:"50%",
                        background:c.value,
                        border: selected ? `3px solid ${THEME.text}` : "2px solid rgba(0,0,0,0.06)",
                        cursor:"pointer",
                        transform: selected ? "scale(1.1)" : "scale(1)",
                        transition:"transform 0.1s",
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Prezzi */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              <div>
                <label style={lbl}>Con ricevuta (€)</label>
                <input
                  value={editingTreatment.priceInvoice}
                  onChange={e=>setEditingTreatment(prev=>prev ? {...prev, priceInvoice:e.target.value} : prev)}
                  placeholder="0.00"
                  inputMode="decimal"
                  style={{ ...inp, textAlign:"right", fontWeight:700 }}
                  disabled={savingTreatment}
                />
              </div>
              <div>
                <label style={lbl}>In contanti (€)</label>
                <input
                  value={editingTreatment.priceCash}
                  onChange={e=>setEditingTreatment(prev=>prev ? {...prev, priceCash:e.target.value} : prev)}
                  placeholder="0.00"
                  inputMode="decimal"
                  style={{ ...inp, textAlign:"right", fontWeight:700 }}
                  disabled={savingTreatment}
                />
              </div>
            </div>

            {/* Durata */}
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>Durata (minuti)</label>
              <input
                value={editingTreatment.durationMin}
                onChange={e=>setEditingTreatment(prev=>prev ? {...prev, durationMin:e.target.value} : prev)}
                placeholder="30"
                inputMode="numeric"
                style={{ ...inp, maxWidth:140, textAlign:"right", fontWeight:700 }}
                disabled={savingTreatment}
              />
            </div>

            {/* Switch attivo */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:"14px 16px", borderRadius:10, border:`1px solid ${THEME.border}`, background:THEME.panelSoft, marginBottom:14 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:THEME.text }}>Attivo</div>
                <div style={{ fontSize:11, color:THEME.muted, marginTop:2 }}>Se disattivato non compare nei selettori del calendario.</div>
              </div>
              <button
                onClick={()=>setEditingTreatment(prev=>prev ? {...prev, isActive:!prev.isActive} : prev)}
                disabled={savingTreatment}
                style={{
                  width:48, height:28, borderRadius:14, border:"none",
                  background: editingTreatment.isActive ? THEME.teal : THEME.gray,
                  position:"relative", cursor:"pointer", flexShrink:0,
                }}
              >
                <span style={{
                  position:"absolute", top:2, left: editingTreatment.isActive ? 22 : 2,
                  width:24, height:24, borderRadius:"50%", background:"#fff",
                  transition:"left 0.15s",
                }} />
              </button>
            </div>
          </div>

          {/* Footer modal sticky */}
          <div style={{ borderTop:`1px solid ${THEME.border}`, padding:"12px 16px", display:"flex", gap:10, background:"#fff", boxShadow:"0 -2px 10px rgba(0,0,0,0.04)" }}>
            <button
              onClick={closeTreatmentModal}
              disabled={savingTreatment}
              style={{ flex:1, padding:"13px", borderRadius:10, border:`1.5px solid ${THEME.border}`, background:"#fff", color:THEME.muted, fontWeight:700, fontSize:14, cursor:"pointer" }}
            >Annulla</button>
            <button
              onClick={()=>void saveTreatment()}
              disabled={savingTreatment}
              style={{ flex:2, padding:"13px", borderRadius:10, border:"none", background:THEME.gradient, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", opacity:savingTreatment?0.6:1 }}
            >
              {savingTreatment ? "Salvataggio…" : (editingTreatment.id ? "Salva modifiche" : "Crea trattamento")}
            </button>
          </div>
        </div>
      )}

      {/* Bottom nav: gestita da MobileTabBar nel layout */}

      {/* Modale modifica ospite (full-screen) */}
      {editingGuest && currentStudioId && (
        <GuestEditModalMobile
          guest={editingGuest as GuestEditRow}
          studioId={currentStudioId}
          onClose={() => setEditingGuest(null)}
          onSaved={() => { void loadGuests(); }}
        />
      )}

      {/* Modal disattivazione ospite con appuntamenti collegati */}
      {guestDeactivateTarget && (
        <div
          onClick={() => !deactivatingGuest && setGuestDeactivateTarget(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: "16px 16px 0 0", width: "100%",
              maxWidth: 480, padding: "22px 18px calc(22px + env(safe-area-inset-bottom))",
              boxShadow: "0 -8px 30px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: THEME.text, marginBottom: 8 }}>
              Disattivare {guestDeactivateTarget.guest.first_name} {guestDeactivateTarget.guest.last_name}?
            </div>
            <div style={{ fontSize: 13, color: THEME.muted, lineHeight: 1.5, marginBottom: 18 }}>
              Ha{" "}
              <b style={{ color: THEME.text }}>
                {guestDeactivateTarget.count} appuntament{guestDeactivateTarget.count === 1 ? "o" : "i"}
              </b>{" "}
              collegat{guestDeactivateTarget.count === 1 ? "o" : "i"}. Cosa vuoi fare?
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => void doDeactivateGuest(guestDeactivateTarget.guest, false)}
                disabled={deactivatingGuest}
                style={{
                  padding: "13px 14px", borderRadius: 10, textAlign: "left",
                  border: `1px solid ${THEME.border}`, background: "#fff",
                  opacity: deactivatingGuest ? 0.6 : 1,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>
                  Disattiva e conserva gli appuntamenti
                </div>
                <div style={{ fontSize: 11, color: THEME.muted, marginTop: 2 }}>
                  Restano in archivio, riattivabili in seguito.
                </div>
              </button>

              <button
                onClick={() => void doDeactivateGuest(guestDeactivateTarget.guest, true)}
                disabled={deactivatingGuest}
                style={{
                  padding: "13px 14px", borderRadius: 10, textAlign: "left",
                  border: `1px solid ${THEME.red}`, background: "rgba(220,38,38,0.06)",
                  opacity: deactivatingGuest ? 0.6 : 1,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, color: THEME.red }}>
                  {deactivatingGuest
                    ? "Eliminazione in corso…"
                    : `Disattiva ed elimina i ${guestDeactivateTarget.count} appuntament${guestDeactivateTarget.count === 1 ? "o" : "i"}`}
                </div>
                <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 2 }}>
                  Irreversibile. I pazienti restano, si eliminano solo le sedute.
                </div>
              </button>

              <button
                onClick={() => setGuestDeactivateTarget(null)}
                disabled={deactivatingGuest}
                style={{
                  padding: "11px 14px", borderRadius: 10, border: "none",
                  background: "transparent", fontSize: 13, fontWeight: 700, color: THEME.muted,
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab bar — prima la forniva il layout /mobile, ora la pagina */}
      <MobileTabBar />
    </div>
    </ToastProvider>
  );
}

// ─── MobileToggle: switch on/off mobile-friendly ───────────────────────
function MobileToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const THEME_LOCAL = {
    text: "#1A1D24", muted: "#6B6455", border: "#E0D8C8", teal: "#0d9488",
  };
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
        padding: "12px 14px", borderRadius: 10,
        border: `1px solid ${THEME_LOCAL.border}`,
        background: checked ? "rgba(13,148,136,0.04)" : "#fff",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: THEME_LOCAL.text, marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: THEME_LOCAL.muted, lineHeight: 1.4 }}>{description}</div>
      </div>
      <div
        role="switch"
        aria-checked={checked}
        style={{
          width: 48, height: 26, minWidth: 48, borderRadius: 13,
          background: checked ? THEME_LOCAL.teal : "#E0D8C8",
          position: "relative",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 24 : 2,
            width: 22, height: 22,
            borderRadius: "50%",
            background: "#fff",
            transition: "left 0.2s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        />
      </div>
    </div>
  );
}
