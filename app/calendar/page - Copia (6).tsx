"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../src/lib/supabaseClient";

type Status = "booked" | "confirmed" | "done" | "cancelled" | "no_show";
type LocationType = "studio" | "domicile";

type AppointmentRow = {
  id: string;
  patient_id: string;
  start_at: string;
  end_at: string;
  status: Status;
  calendar_note: string | null;
  location: LocationType;
  clinic_site: string | null;
  domicile_address: string | null;
  patients: { first_name: string; last_name: string } | null;
};

type PatientLite = { 
  id: string; 
  first_name: string; 
  last_name: string; 
  phone?: string | null;
  treatment?: string | null;
  diagnosis?: string | null;
};

const THEME = {
  appBg: "#f1f5f9",
  panelBg: "#ffffff",
  panelSoft: "#f7f9fd",
  cardBg: "#ffffff",

  text: "#0f172a",
  textSoft: "#1e293b",
  muted: "#334155",

  border: "#cbd5e1",
  borderSoft: "#94a3b8",

  blue: "#2563eb",
  blueDark: "#1e40af",
  green: "#16a34a",
  greenDark: "#15803d",
  patientsAccent: "#0d9488",

  red: "#dc2626",
  amber: "#f97316",
  gray: "#94a3b8",
};

const DEFAULT_CLINIC_SITE = "Studio Pontecorvo";

function statusColor(status: Status) {
  switch (status) {
    case "done":
      return THEME.green;
    case "confirmed":
      return THEME.blue;
    case "no_show":
      return THEME.amber;
    case "cancelled":
      return THEME.gray;
    case "booked":
    default:
      return THEME.red;
  }
}

function statusLabel(status: Status) {
  switch (status) {
    case "confirmed":
      return "Confermato";
    case "done":
      return "Eseguito";
    case "no_show":
      return "Non Pagata";
    case "cancelled":
      return "Annullato";
    default:
      return "Prenotato";
  }
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function startOfISOWeekMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function formatDMY(d: Date) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function addWeeks(d: Date, w: number) {
  return addDays(d, w * 7);
}

function toDateInputValue(d: Date) {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  const out = new Date();
  out.setFullYear(y, m - 1, d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function generateRecurringStarts(params: {
  firstStart: Date;
  untilDate: Date;
  weekDays: number[];
}) {
  const { firstStart, untilDate, weekDays } = params;
  const hh = firstStart.getHours();
  const mm = firstStart.getMinutes();
  const ss = firstStart.getSeconds();
  const ms = firstStart.getMilliseconds();

  const startDay = new Date(firstStart);
  const endDay = new Date(untilDate);
  endDay.setHours(23, 59, 59, 999);

  const results: Date[] = [];

  for (let d = new Date(startDay); d <= endDay; d = addDays(d, 1)) {
    const dow = d.getDay();
    if (dow === 0) continue;
    if (!weekDays.includes(dow)) continue;

    const occ = new Date(d);
    occ.setHours(hh, mm, ss, ms);
    if (occ < firstStart) continue;

    results.push(occ);
  }

  return results;
}

function formatDateRelative(date: Date): string {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  
  const domani = new Date(oggi);
  domani.setDate(oggi.getDate() + 1);
  
  const dataAppuntamento = new Date(date);
  dataAppuntamento.setHours(0, 0, 0, 0);
  
  if (dataAppuntamento.getTime() === oggi.getTime()) {
    return "Oggi";
  } else if (dataAppuntamento.getTime() === domani.getTime()) {
    return "Domani";
  } else {
    const giorni = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
    const mesi = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", 
                  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    
    const giornoSettimana = giorni[dataAppuntamento.getDay()];
    const giorno = dataAppuntamento.getDate();
    const mese = mesi[dataAppuntamento.getMonth()];
    
    return `${giornoSettimana} ${giorno} ${mese}`;
  }
}

const CLINIC_ADDRESSES: Record<string, string> = {
  "Studio Pontecorvo": "Pontecorvo, Via Galileo Galilei 5, dietro il Bar Principe",
};

export default function CalendarPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedEvent, setSelectedEvent] = useState<{
    id: string;
    title: string;
    patient_id?: string;
    location?: LocationType;
    clinic_site?: string | null;
    domicile_address?: string | null;
    treatment?: string | null;
    diagnosis?: string | null;
    amount?: number | null;
    treatment_type?: string;
    price_type?: string;
  } | null>(null);

  const [editStatus, setEditStatus] = useState<Status>("booked");
  const [editNote, setEditNote] = useState("");
  const [editAmount, setEditAmount] = useState<string>("");
  const [editTreatmentType, setEditTreatmentType] = useState<"seduta" | "macchinario">("seduta");
  const [editPriceType, setEditPriceType] = useState<"invoiced" | "cash">("invoiced");

  const [createOpen, setCreateOpen] = useState(false);
  const [createStartISO, setCreateStartISO] = useState<string>("");
  const [createEndISO, setCreateEndISO] = useState<string>("");

  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [patientResults, setPatientResults] = useState<PatientLite[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientLite | null>(null);
  const [creating, setCreating] = useState(false);
  const searchTimer = useRef<any>(null);

  const [createLocation, setCreateLocation] = useState<LocationType>("studio");
  const [createClinicSite, setCreateClinicSite] = useState(DEFAULT_CLINIC_SITE);
  const [createDomicileAddress, setCreateDomicileAddress] = useState("");

  const [treatmentType, setTreatmentType] = useState<"seduta" | "macchinario">("seduta");
  const [priceType, setPriceType] = useState<"invoiced" | "cash">("invoiced");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [useCustomPrice, setUseCustomPrice] = useState(false);

  const [selectedStartTime, setSelectedStartTime] = useState<string>("09:00");
  const [selectedDuration, setSelectedDuration] = useState<"1" | "1.5" | "2">("1");

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [recurringUntil, setRecurringUntil] = useState<string>(() => toDateInputValue(addWeeks(new Date(), 4)));

  const [quickPatientOpen, setQuickPatientOpen] = useState(false);
  const [quickPatientFirstName, setQuickPatientFirstName] = useState("");
  const [quickPatientLastName, setQuickPatientLastName] = useState("");
  const [quickPatientPhone, setQuickPatientPhone] = useState("");
  const [creatingQuickPatient, setCreatingQuickPatient] = useState(false);

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewType, setViewType] = useState<"day" | "week">("week");

  const [draggingEvent, setDraggingEvent] = useState<{
    id: string;
    originalStart: Date;
    originalEnd: Date;
  } | null>(null);

  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const printMenuRef = useRef<HTMLDivElement>(null);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);

  const [showWhatsAppConfirm, setShowWhatsAppConfirm] = useState(false);
  const [lastCreatedAppointment, setLastCreatedAppointment] = useState<{
    id: string;
    patientPhone?: string | null;
    patientName?: string;
    startTime?: Date;
  } | null>(null);

  const [duplicateMode, setDuplicateMode] = useState(false);
  const [eventToDuplicate, setEventToDuplicate] = useState<any>(null);
  const [duplicateDate, setDuplicateDate] = useState<string>("");
  const [duplicateTime, setDuplicateTime] = useState<string>("09:00");

  // Timer per linea del tempo corrente
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const weekDays = useMemo(() => {
    const days = [];
    const startOfWeek = startOfISOWeekMonday(currentDate);
    
    for (let i = 0; i < 6; i++) {
      const day = addDays(startOfWeek, i);
      days.push(day);
    }
    return days;
  }, [currentDate]);

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 7; hour < 22; hour++) {
      slots.push(`${pad2(hour)}:00`);
    }
    return slots;
  }, []);

  const timeSelectSlots = useMemo(() => {
    const slots = [];
    for (let hour = 7; hour < 22; hour++) {
      for (let minute of [0, 30]) {
        slots.push(`${pad2(hour)}:${pad2(minute)}`);
      }
    }
    return slots;
  }, []);

  const getEventPosition = useCallback((start: Date, end: Date) => {
    const startHour = start.getHours();
    const startMinute = start.getMinutes();
    const endHour = end.getHours();
    const endMinute = end.getMinutes();
    
    const top = ((startHour - 7) * 60 + startMinute);
    const height = ((endHour - startHour) * 60 + (endMinute - startMinute));
    
    return { top, height };
  }, []);

  const getAvailableSlots = useCallback((date: Date) => {
    const slots = [];
    
    for (let hour = 7; hour < 22; hour++) {
      for (let minute of [0, 30]) {
        const slotStart = new Date(date);
        slotStart.setHours(hour, minute, 0, 0);
        
        const slotEnd = new Date(slotStart.getTime() + 60 * 60000);
        
        const isOccupied = events.some(event => {
          return (
            event.start.getDate() === date.getDate() &&
            event.start.getMonth() === date.getMonth() &&
            event.start.getFullYear() === date.getFullYear() &&
            (
              (event.start >= slotStart && event.start < slotEnd) ||
              (event.end > slotStart && event.end <= slotEnd) ||
              (event.start <= slotStart && event.end >= slotEnd)
            )
          );
        });
        
        if (!isOccupied) {
          slots.push({
            start: slotStart,
            end: slotEnd,
            time: `${pad2(hour)}:${pad2(minute)}`
          });
        }
      }
    }
    
    return slots;
  }, [events]);

  const weekOptions = useMemo(() => {
    const base = startOfISOWeekMonday(new Date());
    const opts: { value: string; label: string }[] = [];
    for (let w = -12; w <= 24; w++) {
      const start = addDays(base, w * 7);
      const end = addDays(start, 5);
      opts.push({
        value: start.toISOString(),
        label: `SETTIMANA ${formatDMY(start)} → ${formatDMY(end)}`,
      });
    }
    return opts;
  }, []);

  const loadAppointments = useCallback(async (startDate: Date, endDate: Date) => {
    setLoading(true);
    setError("");

    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    const { data, error } = await supabase
      .from("appointments")
      .select(`
        id, patient_id, start_at, end_at, status, calendar_note, location, clinic_site, domicile_address, treatment_type, price_type, amount,
        patients:patient_id ( first_name, last_name, treatment, diagnosis, phone )
      `)
      .gte("start_at", startISO)
      .lt("start_at", endISO)
      .order("start_at", { ascending: true });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const mapped = (data ?? []).map((a: AppointmentRow & { treatment_type?: string; price_type?: string; amount?: number; patients?: { phone?: string } }) => {
      const name = a.patients ? `${a.patients.first_name} ${a.patients.last_name}` : "Paziente";
      const title = name;

      return {
        id: a.id,
        title,
        start: new Date(a.start_at),
        end: new Date(a.end_at),
        status: a.status,
        patient_id: a.patient_id,
        location: a.location,
        clinic_site: a.clinic_site,
        domicile_address: a.domicile_address,
        treatment: a.patients?.treatment || null,
        diagnosis: a.patients?.diagnosis || null,
        patient_phone: a.patients?.phone || null,
        patient_name: name,
        calendar_note: a.calendar_note,
        treatment_type: a.treatment_type || "seduta",
        price_type: a.price_type || "invoiced",
        amount: a.amount || null
      };
    });

    setEvents(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (viewType === "week") {
      const startOfWeek = startOfISOWeekMonday(currentDate);
      const endOfWeek = addDays(startOfWeek, 7);
      loadAppointments(startOfWeek, endOfWeek);
    } else {
      const startOfDay = new Date(currentDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(23, 59, 59, 999);
      loadAppointments(startOfDay, endOfDay);
    }
  }, [currentDate, viewType, loadAppointments]);

  const stats = useMemo(() => {
    const filteredEvents = viewType === "week" 
      ? events 
      : events.filter(e => 
          e.start.getDate() === currentDate.getDate() &&
          e.start.getMonth() === currentDate.getMonth() &&
          e.start.getFullYear() === currentDate.getFullYear()
        );
    
    return {
      total: filteredEvents.length,
      done: filteredEvents.filter(e => e.status === "done").length,
      confirmed: filteredEvents.filter(e => e.status === "confirmed").length,
      booked: filteredEvents.filter(e => e.status === "booked").length,
      revenue: filteredEvents.reduce((sum, e) => {
        if (e.amount) {
          return e.status === "done" ? sum + e.amount : sum;
        } else {
          const price = e.treatment_type === "seduta" 
            ? (e.price_type === "invoiced" ? 40 : 35)
            : (e.price_type === "invoiced" ? 25 : 20);
          return e.status === "done" ? sum + price : sum;
        }
      }, 0),
    };
  }, [events, viewType, currentDate]);

  const filteredEvents = useMemo(() => {
    let result = events;
    
    if (statusFilter !== "all") {
      result = result.filter(event => event.status === statusFilter);
    }
    
    return result;
  }, [events, statusFilter]);

  const exportAppointments = useCallback(() => {
    const csvContent = [
      ["Data", "Ora Inizio", "Ora Fine", "Paziente", "Stato", "Trattamento", "Prezzo", "Sede", "Fatturato"],
      ...events.map(e => [
        formatDMY(e.start),
        fmtTime(e.start.toISOString()),
        fmtTime(e.end.toISOString()),
        e.patient_name,
        statusLabel(e.status),
        e.treatment_type === "seduta" ? "Seduta" : "Macchinario",
        e.amount ? `€${e.amount}` : (e.treatment_type === "seduta" 
          ? (e.price_type === "invoiced" ? "€40" : "€35")
          : (e.price_type === "invoiced" ? "€25" : "€20")),
        e.location === "domicile" ? "DOMICILIO" : e.clinic_site,
        e.price_type === "invoiced" ? "Sì" : "No"
      ])
    ].map(row => row.join(",")).join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appuntamenti_${formatDMY(new Date())}.csv`;
    a.click();
    
    window.URL.revokeObjectURL(url);
  }, [events]);

  const sendReminder = useCallback(async (appointmentId: string, patientPhone?: string, patientName?: string, isConfirmation?: boolean) => {
    if (!patientPhone) {
      alert("Nessun telefono registrato per questo paziente");
      return;
    }
    
    const appointment = events.find(e => e.id === appointmentId);
    if (!appointment) return;
    
    // Ottieni il template appropriato
    const templateName = isConfirmation ? "Appuntamento" : "Promemoria";
    
    const { data: templateData } = await supabase
      .from("message_templates")
      .select("template")
      .eq("name", templateName)
      .maybeSingle();
    
    let templateText = "";
    if (isConfirmation) {
      templateText = `Grazie per averci scelto.
Ricordiamo il prossimo appuntamento fissato per {data_relativa} alle {ora}.

A presto,
Dr. Marco Turchetta
Fisioterapia e Osteopatia`;
    } else {
      templateText = `Buongiorno {nome},

Le ricordiamo il suo appuntamento di {data_relativa} alle ore ⏰ {ora}.

📍 {luogo}

Cordiali saluti,
Dr. Marco Turchetta
Fisioterapia e Osteopatia`;
    }
    
    if (templateData?.template) {
      templateText = templateData.template;
    }
    
    const cleanPhone = patientPhone.replace(/\s+/g, '').replace('+', '');
    
    const dataRelativa = formatDateRelative(appointment.start);
    const ora = fmtTime(appointment.start.toISOString());
    
    let luogo = "";
    if (appointment.location === 'studio') {
      luogo = CLINIC_ADDRESSES[appointment.clinic_site || ""] || 
              appointment.clinic_site || 
              "Pontecorvo, Via Galileo Galilei 5, dietro il Bar Principe";
    } else {
      luogo = `Presso il suo domicilio (${appointment.domicile_address})`;
    }
    
    const nomePaziente = patientName ? patientName.split(' ')[0] : "Cliente";
    
    let message = templateText
      .replace(/{nome}/g, nomePaziente)
      .replace(/{data_relativa}/g, dataRelativa)
      .replace(/{ora}/g, ora)
      .replace(/{luogo}/g, luogo);
    
    const encodedMessage = encodeURIComponent(message);
    
        const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
    
    const confirmText = isConfirmation 
      ? `📱 CONFERMA NUOVO APPOINTAMENTO WHATSAPP\n\nDestinatario: ${patientPhone}\n\nMessaggio:\n${message}\n\nClicca OK per aprire WhatsApp e inviare.`
      : `📱 INVIO PROMEMORIA WHATSAPP\n\nDestinatario: ${patientPhone}\n\nMessaggio:\n${message}\n\nClicca OK per aprire WhatsApp e inviare.`;
    
    const confirm = window.confirm(confirmText);
    
    if (!confirm) return;
    
    // Prova ad aprire WhatsApp in vari modi
    console.log("Tentativo di aprire WhatsApp:", whatsappUrl);
    
    // Metodo 1: Prova con window.open
    const newWindow = window.open(whatsappUrl, '_blank');
    
    // Se è bloccato, usa location.href come fallback
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      console.log("window.open bloccato, provo con location.href");
      
      // Chiedi all'utente se vuole aprire manualmente
      const manualOpen = confirm(
        `Il browser ha bloccato l'apertura automatica di WhatsApp.\n\n` +
        `URL: ${whatsappUrl}\n\n` +
        `Clicca OK per provare ad aprire, oppure Annulla per copiare il link.`
      );
      
      if (manualOpen) {
        // Prova con location.href (a volte funziona quando window.open no)
        window.location.href = whatsappUrl;
      } else {
        // Mostra il link da copiare
        alert(`Copia questo link e aprilo manualmente:\n\n${whatsappUrl}`);
      }
    }
    
  }, [events]);

  const updateDuplicateDateTime = useCallback((newDate: string, newTime: string) => {
    if (!newDate || !newTime) return;
    
    const date = parseDateInput(newDate);
    const [hours, minutes] = newTime.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
    
    const durationHours = parseFloat(selectedDuration);
    const endDate = new Date(date.getTime() + durationHours * 60 * 60000);
    
    setCreateStartISO(date.toISOString());
    setCreateEndISO(endDate.toISOString());
  }, [selectedDuration]);

  const openCreateModal = useCallback((date: Date, hour: number = 9, minute: number = 0, duplicateEvent?: any) => {
    const timeStr = `${pad2(hour)}:${pad2(minute)}`;
    
    // Imposta il tempo di default basato sull'evento duplicato o sull'orario corrente
    const defaultTime = duplicateEvent ? 
      `${pad2(duplicateEvent.start.getHours())}:${pad2(duplicateEvent.start.getMinutes())}` : 
      timeSelectSlots.includes(timeStr) ? timeStr : "09:00";
    
    setSelectedStartTime(defaultTime);
    setDuplicateTime(defaultTime);
    
    const startTime = new Date(date);
    const [hours, minutes] = defaultTime.split(':').map(Number);
    startTime.setHours(hours, minutes, 0, 0);
    
    const durationHours = parseFloat(selectedDuration);
    const endTime = new Date(startTime.getTime() + durationHours * 60 * 60000);

    setCreateStartISO(startTime.toISOString());
    setCreateEndISO(endTime.toISOString());
    
    // Imposta la data di duplicazione
    setDuplicateDate(toDateInputValue(date));

    setQ("");
    setPatientResults([]);
    setSelectedPatient(null);

    if (duplicateEvent) {
      setDuplicateMode(true);
      setEventToDuplicate(duplicateEvent);
      setCreateLocation(duplicateEvent.location);
      setCreateClinicSite(duplicateEvent.clinic_site || DEFAULT_CLINIC_SITE);
      setCreateDomicileAddress(duplicateEvent.domicile_address || "");
      setTreatmentType(duplicateEvent.treatment_type || "seduta");
      setPriceType(duplicateEvent.price_type || "invoiced");
      setCustomAmount(duplicateEvent.amount ? duplicateEvent.amount.toString() : "");
      setUseCustomPrice(!!duplicateEvent.amount);
      
      // Imposta la durata basata sull'evento duplicato
      const eventDurationHours = (duplicateEvent.end.getTime() - duplicateEvent.start.getTime()) / (60 * 60000);
      if (eventDurationHours === 1) setSelectedDuration("1");
      else if (eventDurationHours === 1.5) setSelectedDuration("1.5");
      else if (eventDurationHours === 2) setSelectedDuration("2");
      
      // Imposta il paziente selezionato
      const patientFromEvent = patientResults.find(p => 
        `${p.last_name} ${p.first_name}` === duplicateEvent.patient_name
      ) || {
        id: duplicateEvent.patient_id,
        first_name: duplicateEvent.patient_name.split(' ')[0],
        last_name: duplicateEvent.patient_name.split(' ')[1] || '',
      };
      
      setSelectedPatient(patientFromEvent);
    } else {
      setDuplicateMode(false);
      setEventToDuplicate(null);
      setCreateLocation("studio");
      setCreateClinicSite(DEFAULT_CLINIC_SITE);
      setCreateDomicileAddress("");
      setTreatmentType("seduta");
      setPriceType("invoiced");
      setCustomAmount("");
      setUseCustomPrice(false);
    }

    setIsRecurring(false);
    const dow = date.getDay();
    const defaultDays = dow === 0 ? [1] : [dow];
    setRecurringDays(defaultDays);
    setRecurringUntil(toDateInputValue(addWeeks(date, 4)));

    setQuickPatientFirstName("");
    setQuickPatientLastName("");
    setQuickPatientPhone("");

    setShowWhatsAppConfirm(false);
    setLastCreatedAppointment(null);

    setError("");
    setCreateOpen(true);
  }, [selectedStartTime, selectedDuration, timeSelectSlots, patientResults]);

  const handleSlotClick = useCallback((date: Date, hour: number, minute: number = 0) => {
    openCreateModal(date, hour, minute);
  }, [openCreateModal]);

  const searchPatients = useCallback(async (query: string) => {
    const cleaned = query.trim();
    if (cleaned.length < 2) {
      setPatientResults([]);
      setSelectedPatient(null);
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
      setError(`Errore ricerca paziente: ${error.message}`);
      setPatientResults([]);
      return;
    }

    setPatientResults((data ?? []) as PatientLite[]);
  }, []);

  useEffect(() => {
    if (!createOpen) return;

    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchPatients(q);
    }, 250);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [q, createOpen, searchPatients]);

  useEffect(() => {
    if (!createStartISO || !selectedStartTime || !selectedDuration) return;
    
    // Se siamo in modalità duplicazione, usa le variabili specifiche
    if (duplicateMode && duplicateDate && duplicateTime) {
      updateDuplicateDateTime(duplicateDate, duplicateTime);
    } else {
      const baseDate = new Date(createStartISO);
      const [hours, minutes] = selectedStartTime.split(':').map(Number);
      const dateOnly = new Date(baseDate);
      dateOnly.setHours(hours, minutes, 0, 0);
      
      const durationHours = parseFloat(selectedDuration);
      const endDate = new Date(dateOnly.getTime() + durationHours * 60 * 60000);
      
      setCreateStartISO(dateOnly.toISOString());
      setCreateEndISO(endDate.toISOString());
    }
  }, [selectedStartTime, selectedDuration, createStartISO, duplicateMode, duplicateDate, duplicateTime, updateDuplicateDateTime]);

  useEffect(() => {
    if (createOpen && duplicateMode && eventToDuplicate) {
      const date = eventToDuplicate.start;
      setDuplicateDate(toDateInputValue(date));
      setDuplicateTime(`${pad2(date.getHours())}:${pad2(date.getMinutes())}`);
    }
  }, [createOpen, duplicateMode, eventToDuplicate]);

  const toggleDoneQuick = useCallback(async (apptId: string, current: Status) => {
    setError("");
    const next: Status = current === "done" ? "confirmed" : "done";

    const { error } = await supabase.from("appointments").update({ status: next }).eq("id", apptId);

    if (error) {
      setError(`Errore aggiornamento stato: ${error.message}`);
      return;
    }

    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
  }, [currentDate, loadAppointments]);

  const createQuickPatient = useCallback(async () => {
    if (!quickPatientFirstName.trim() || !quickPatientLastName.trim()) {
      setError("Inserisci nome e cognome per il nuovo paziente.");
      return;
    }

    setCreatingQuickPatient(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("patients")
        .insert({
          first_name: quickPatientFirstName.trim(),
          last_name: quickPatientLastName.trim(),
          phone: quickPatientPhone.trim() || null,
          status: "da_completare",
          created_at: new Date().toISOString(),
        })
        .select("id, first_name, last_name, phone")
        .single();

      if (error) throw error;

      if (data) {
        const newPatient: PatientLite = {
          id: data.id,
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone,
        };

        setSelectedPatient(newPatient);
        setPatientResults(prev => [newPatient, ...prev]);
        setQuickPatientOpen(false);
        setQuickPatientFirstName("");
        setQuickPatientLastName("");
        setQuickPatientPhone("");
        
        setError("Paziente creato con successo! Ora puoi creare l'appuntamento.");
      }
    } catch (err: any) {
      setError(`Errore creazione paziente: ${err.message}`);
    } finally {
      setCreatingQuickPatient(false);
    }
  }, [quickPatientFirstName, quickPatientLastName, quickPatientPhone]);

  const createAppointment = useCallback(async (sendWhatsApp: boolean = false) => {
  setError("");

  if (!selectedPatient) {
    setError("Seleziona un paziente prima di creare l'appuntamento.");
    return;
  }
  if (!createStartISO || !createEndISO) {
    setError("Orari appuntamento non validi.");
    return;
  }

  if (createLocation === "studio") {
    if (!createClinicSite.trim()) {
      setError("Inserisci il nome della sede (clinic_site).");
      return;
    }
  } else {
    if (createDomicileAddress.trim().length < 5) {
      setError("Inserisci un indirizzo domicilio valido (min 5 caratteri).");
      return;
    }
  }

  const firstStart = new Date(createStartISO);
  const firstEnd = new Date(createEndISO);
  const durationMs = firstEnd.getTime() - firstStart.getTime();
  if (durationMs <= 0) {
    setError("Durata appuntamento non valida.");
    return;
  }

  if (isRecurring) {
    if (recurringDays.length === 0) {
      setError("Seleziona almeno un giorno per la ricorrenza.");
      return;
    }
    const until = parseDateInput(recurringUntil);
    if (until < firstStart) {
      setError("La data 'Ripeti fino a' non può essere precedente alla prima data.");
      return;
    }
  }

  let amount: number;
  if (useCustomPrice && customAmount) {
    const parsed = parseFloat(customAmount.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) {
      setError("Importo personalizzato non valido.");
      return;
    }
    amount = parsed;
  } else {
    amount = treatmentType === "seduta" 
      ? (priceType === "invoiced" ? 40 : 35)
      : (priceType === "invoiced" ? 25 : 20);
  }

  setCreating(true);

  const basePayload = {
    patient_id: selectedPatient.id,
    status: "booked" as Status,
    calendar_note: null as string | null,
    location: createLocation,
    clinic_site: createLocation === "studio" ? createClinicSite.trim() : null,
    domicile_address: createLocation === "domicile" ? createDomicileAddress.trim() : null,
    treatment_type: treatmentType,
    price_type: priceType,
    amount: amount,
  };

  try {
    let createdAppointmentId: string | null = null;

    if (!isRecurring) {
      const payload = {
        ...basePayload,
        start_at: firstStart.toISOString(),
        end_at: firstEnd.toISOString(),
      };

      const { data, error: insErr } = await supabase.from("appointments").insert(payload).select().single();
      if (insErr) throw new Error(insErr.message);

      if (data) {
        createdAppointmentId = data.id;
        
        // Se dobbiamo inviare WhatsApp, lo facciamo ora
        if (sendWhatsApp) {
          // Invia direttamente WhatsApp senza passare per sendReminder
          const cleanPhone = (selectedPatient.phone || "").replace(/\s+/g, '').replace('+', '');
          
          if (!cleanPhone) {
            alert("Nessun telefono registrato per questo paziente");
          } else {
            const dataRelativa = formatDateRelative(firstStart);
            const ora = fmtTime(firstStart.toISOString());
            
            let luogo = "";
            if (createLocation === 'studio') {
              luogo = CLINIC_ADDRESSES[createClinicSite] || 
                      createClinicSite || 
                      "Pontecorvo, Via Galileo Galilei 5, dietro il Bar Principe";
            } else {
              luogo = `Presso il suo domicilio (${createDomicileAddress})`;
            }
            
            const nomePaziente = selectedPatient.first_name || "Cliente";
            
            const message = `Grazie per averci scelto.
Ricordiamo il prossimo appuntamento fissato per ${dataRelativa} alle ${ora}.

📍 ${luogo}

A presto,
Dr. Marco Turchetta
Fisioterapia e Osteopatia`;
            
            const encodedMessage = encodeURIComponent(message);
            const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
            
            // Apri WhatsApp direttamente
            window.open(whatsappUrl, '_blank');
          }
        }
      }

    } else {
      const until = parseDateInput(recurringUntil);

      const starts = generateRecurringStarts({
        firstStart,
        untilDate: until,
        weekDays: recurringDays,
      });

      if (starts.length > 200) {
        throw new Error(
          `Ricorrenza troppo ampia: ${starts.length} appuntamenti. Riduci l'intervallo o i giorni selezionati.`
        );
      }

      const rows = starts.map((s) => ({
        ...basePayload,
        start_at: s.toISOString(),
        end_at: new Date(s.getTime() + durationMs).toISOString(),
      }));

      const { error: insErr } = await supabase.from("appointments").insert(rows);
      if (insErr) throw new Error(insErr.message);
      
      // Per ricorrenze, non inviamo WhatsApp (troppi messaggi)
      if (sendWhatsApp) {
        alert("Per appuntamenti ricorrenti, WhatsApp non viene inviato automaticamente per evitare troppi messaggi.");
      }
    }

    setCreateOpen(false);
    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
    
  } catch (e: any) {
    setError(`Errore creazione appuntamento: ${e?.message ?? "Errore sconosciuto"}`);
  } finally {
    setCreating(false);
  }
}, [
  selectedPatient,
  createStartISO,
  createEndISO,
  createLocation,
  createClinicSite,
  createDomicileAddress,
  isRecurring,
  recurringDays,
  recurringUntil,
  treatmentType,
  priceType,
  useCustomPrice,
  customAmount,
  currentDate,
  loadAppointments,
]);

  const saveAppointment = useCallback(async () => {
    if (!selectedEvent) return;

    setError("");

    let amount: number | null = null;
    if (editAmount) {
      const parsed = parseFloat(editAmount.replace(',', '.'));
      if (!isNaN(parsed) && parsed > 0) {
        amount = parsed;
      }
    }

    const updateData: any = {
      status: editStatus,
      calendar_note: editNote.trim() || null,
      treatment_type: editTreatmentType,
      price_type: editPriceType,
    };

    if (amount !== null) {
      updateData.amount = amount;
    }

    const { error } = await supabase
      .from("appointments")
      .update(updateData)
      .eq("id", selectedEvent.id);

    if (error) {
      setError(`Errore salvataggio: ${error.message}`);
      return;
    }

    setSelectedEvent(null);
    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
  }, [selectedEvent, editStatus, editNote, editAmount, editTreatmentType, editPriceType, currentDate, loadAppointments]);

  const deleteAppointment = useCallback(async () => {
    if (!selectedEvent) return;

    const ok = window.confirm("Vuoi eliminare definitivamente questo appuntamento?");
    if (!ok) return;

    setError("");

    const { error } = await supabase.from("appointments").delete().eq("id", selectedEvent.id);

    if (error) {
      setError(`Errore eliminazione: ${error.message}`);
      return;
    }

    setSelectedEvent(null);
    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
  }, [selectedEvent, currentDate, loadAppointments]);

  const printCalendar = useCallback(() => {
    window.print();
    setPrintMenuOpen(false);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (printMenuRef.current && !printMenuRef.current.contains(event.target as Node)) {
        setPrintMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const goToPreviousWeek = useCallback(() => {
    setCurrentDate(prev => addWeeks(prev, -1));
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentDate(prev => addWeeks(prev, 1));
  }, []);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const gotoWeekStart = useCallback((iso: string) => {
    setCurrentDate(new Date(iso));
  }, []);

  const dayLabels = useMemo(
    () => [
      { dow: 1, label: "LUN" },
      { dow: 2, label: "MAR" },
      { dow: 3, label: "MER" },
      { dow: 4, label: "GIO" },
      { dow: 5, label: "VEN" },
      { dow: 6, label: "SAB" },
    ],
    []
  );

  const toggleRecurringDay = useCallback((dow: number) => {
    setRecurringDays((prev) => {
      if (prev.includes(dow)) return prev.filter((x) => x !== dow);
      return [...prev, dow].sort((a, b) => a - b);
    });
  }, []);

  const handleDragStart = useCallback((event: React.DragEvent, apptId: string, originalStart: Date, originalEnd: Date) => {
    setDraggingEvent({ id: apptId, originalStart, originalEnd });
    event.dataTransfer.setData("text/plain", apptId);
    event.dataTransfer.effectAllowed = "move";
    
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = "0.4";
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.backgroundColor = "rgba(37, 99, 235, 0.05)";
    }
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.backgroundColor = "transparent";
    }
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent, targetDate: Date, targetHour: number) => {
    event.preventDefault();
    
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.backgroundColor = "transparent";
    }
    
    if (!draggingEvent) return;

    const apptId = event.dataTransfer.getData("text/plain");
    if (apptId !== draggingEvent.id) return;

    const newStart = new Date(targetDate);
    newStart.setHours(targetHour, 0, 0, 0);
    
    const duration = draggingEvent.originalEnd.getTime() - draggingEvent.originalStart.getTime();
    const newEnd = new Date(newStart.getTime() + duration);

    setError("");

    const { error } = await supabase
      .from("appointments")
      .update({
        start_at: newStart.toISOString(),
        end_at: newEnd.toISOString(),
      })
      .eq("id", apptId);

    if (error) {
      setError(`Errore spostamento: ${error.message}`);
    } else {
      const startOfWeek = startOfISOWeekMonday(currentDate);
      const endOfWeek = addDays(startOfWeek, 7);
      await loadAppointments(startOfWeek, endOfWeek);
    }

    setDraggingEvent(null);
  }, [draggingEvent, currentDate, loadAppointments]);

  const handleDragEnd = useCallback((event: React.DragEvent) => {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = "1";
    }
    setDraggingEvent(null);
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      const event = events.find(e => e.id === selectedEvent.id);
      if (event) {
        setEditAmount(event.amount ? event.amount.toString() : "");
        setEditTreatmentType(event.treatment_type || "seduta");
        setEditPriceType(event.price_type || "invoiced");
      }
    }
  }, [selectedEvent, events]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: THEME.appBg }}>
      <aside
        className="no-print"
        style={{
          width: 250,
          background: THEME.panelBg,
          borderRight: `1px solid ${THEME.border}`,
          padding: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900, color: THEME.blueDark, letterSpacing: -0.2 }}>FisioHub</div>

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/" style={{ 
            color: THEME.blueDark, 
            fontWeight: 800, 
            textDecoration: "none", 
            display: "flex", 
            alignItems: "center", 
            gap: 8,
          }}>
            🏠 Home
          </Link>
          <Link href="/calendar" style={{ 
            color: THEME.blue, 
            fontWeight: 800, 
            textDecoration: "none",
            display: "flex", 
            alignItems: "center", 
            gap: 8,
          }}>
            📅 Calendario
          </Link>
          <Link href="/patients" style={{ 
            color: THEME.blueDark, 
            fontWeight: 800, 
            textDecoration: "none",
            display: "flex", 
            alignItems: "center", 
            gap: 8,
          }}>
            👤 Pazienti
          </Link>
        </div>

        <div style={{ marginTop: 26, fontSize: 12, color: THEME.muted }}>
          Gestione agenda appuntamenti
        </div>
      </aside>

      <main className="print-wrap" style={{ flex: 1, display: "flex", flexDirection: "column", padding: 24, minWidth: 0 }}>
        <div style={{ width: "100%" }}>
          <div className="no-print" style={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "space-between", 
            gap: 20, 
            flexWrap: "wrap", 
            marginBottom: 24,
            padding: "0 4px"
          }}>
            <div style={{ flex: 1, minWidth: 300 }}>
              <h1 style={{ margin: 0, color: THEME.blueDark, fontWeight: 900, fontSize: 32, letterSpacing: -0.2 }}>
                Agenda
              </h1>
              <div style={{ marginTop: 6, fontSize: 12, color: THEME.muted, fontWeight: 800 }}>
                Domenica rimossa · Eventi squadrati · Ricorrenze · Stampa
              </div>
            </div>

            <div style={{ 
              display: "flex", 
              gap: 16, 
              flexWrap: "nowrap", 
              alignItems: "center",
              justifyContent: "flex-end",
              flex: 1,
              minWidth: 500,
              marginTop: 8
            }}>
              <div style={{ 
                display: "flex", 
                flexDirection: "column", 
                gap: 6,
                flex: "0 0 auto",
                width: 340
              }}>
                <div style={{ fontSize: 11, color: THEME.muted, fontWeight: 900 }}>SETTIMANA</div>
                <select
                  value={startOfISOWeekMonday(currentDate).toISOString()}
                  onChange={(e) => gotoWeekStart(e.target.value)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.borderSoft}`,
                    background: THEME.panelBg,
                    color: THEME.text,
                    fontWeight: 800,
                    outline: "none",
                    width: "100%",
                    fontSize: 13,
                    height: 46,
                  }}
                >
                  {weekOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div ref={printMenuRef} style={{ position: "relative", flexShrink: 0 }}>
                <button
                  onClick={() => setPrintMenuOpen(!printMenuOpen)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.greenDark}`,
                    background: THEME.green,
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                    height: 46,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    width: 340,
                    justifyContent: "center"
                  }}
                >
                  🖨️ Stampa
                  <span style={{ fontSize: 10, marginLeft: 4 }}>▼</span>
                </button>

                {printMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: 0,
                      marginTop: 4,
                      background: THEME.panelBg,
                      border: `1px solid ${THEME.borderSoft}`,
                      borderRadius: 8,
                      boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
                      zIndex: 1000,
                      minWidth: 160,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      onClick={() => {
                        setViewType("day");
                        printCalendar();
                      }}
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        border: "none",
                        background: "transparent",
                        color: THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        textAlign: "left",
                        borderBottom: `1px solid ${THEME.border}`,
                        fontSize: 13,
                      }}
                    >
                      Stampa giorno
                    </button>
                    <button
                      onClick={() => {
                        setViewType("week");
                        printCalendar();
                      }}
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        border: "none",
                        background: "transparent",
                        color: THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        textAlign: "left",
                        fontSize: 13,
                      }}
                    >
                      Stampa settimana
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div
              className="no-print"
              style={{
                marginTop: 12,
                marginBottom: 16,
                background: "rgba(220,38,38,0.08)",
                border: "1px solid rgba(220,38,38,0.22)",
                color: THEME.red,
                padding: 12,
                borderRadius: 8,
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}

          {loading && (
            <div style={{ 
              padding: 40, 
              textAlign: "center", 
              color: THEME.muted, 
              fontWeight: 900, 
              fontSize: 14,
              background: THEME.panelBg,
              borderRadius: 8,
              border: `1px solid ${THEME.border}`
            }}>
              Caricamento appuntamenti...
            </div>
          )}

          <div className="no-print" style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center", 
            marginBottom: 16,
            padding: "12px 16px",
            background: THEME.panelBg,
            borderRadius: 8,
            border: `1px solid ${THEME.border}`
          }}>
            <div style={{ display: "flex", gap: 8 }}>
              {viewType === "week" ? (
                <>
                  <button
                    onClick={goToPreviousWeek}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelSoft,
                      color: THEME.text,
                      cursor: "pointer",
                      fontWeight: 900,
                      fontSize: 13,
                      minWidth: 44,
                    }}
                  >
                    ◀
                  </button>
                  <button
                    onClick={goToToday}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.blueDark}`,
                      background: THEME.blue,
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: 900,
                      fontSize: 13,
                    }}
                  >
                    Oggi
                  </button>
                  <button
                    onClick={goToNextWeek}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelSoft,
                      color: THEME.text,
                      cursor: "pointer",
                      fontWeight: 900,
                      fontSize: 13,
                      minWidth: 44,
                    }}
                  >
                    ▶
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setCurrentDate(prev => addDays(prev, -1))}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelSoft,
                      color: THEME.text,
                      cursor: "pointer",
                      fontWeight: 900,
                      fontSize: 13,
                      minWidth: 44,
                    }}
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => setCurrentDate(new Date())}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.blueDark}`,
                      background: THEME.blue,
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: 900,
                      fontSize: 13,
                    }}
                  >
                    Oggi
                  </button>
                  <button
                    onClick={() => setCurrentDate(prev => addDays(prev, 1))}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelSoft,
                      color: THEME.text,
                      cursor: "pointer",
                      fontWeight: 900,
                      fontSize: 13,
                      minWidth: 44,
                    }}
                  >
                    ▶
                  </button>
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginRight: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: THEME.green, background: "rgba(22, 163, 74, 0.1)", padding: "4px 8px", borderRadius: 6 }}>
                  ✓ {stats.done}/{stats.total}
                </div>
                <div style={{ fontSize: 12, fontWeight: 900, color: THEME.blue, background: "rgba(37, 99, 235, 0.1)", padding: "4px 8px", borderRadius: 6 }}>
                  💰 €{stats.revenue}
                </div>
                <div style={{ fontSize: 12, fontWeight: 900, color: THEME.amber, background: "rgba(249, 115, 22, 0.1)", padding: "4px 8px", borderRadius: 6 }}>
                  📅 {stats.booked} prenotati
                </div>
              </div>
              
              <button
                onClick={exportAppointments}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `1px solid ${THEME.gray}`,
                  background: THEME.panelSoft,
                  color: THEME.text,
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 13,
                  minWidth: 100,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                📁 Esporta CSV
              </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  setViewType("day");
                  if (viewType !== "day") {
                    setCurrentDate(new Date());
                  }
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `1px solid ${viewType === "day" ? THEME.blueDark : THEME.borderSoft}`,
                  background: viewType === "day" ? THEME.blue : THEME.panelSoft,
                  color: viewType === "day" ? "#fff" : THEME.text,
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 13,
                  minWidth: 80,
                }}
              >
                Giorno
              </button>
              <button
                onClick={() => {
                  setViewType("week");
                  if (viewType !== "week") {
                    setCurrentDate(new Date());
                  }
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `1px solid ${viewType === "week" ? THEME.blueDark : THEME.borderSoft}`,
                  background: viewType === "week" ? THEME.blue : THEME.panelSoft,
                  color: viewType === "week" ? "#fff" : THEME.text,
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 13,
                  minWidth: 80,
                }}
              >
                Settimana
              </button>
            </div>

            <div style={{ fontSize: 14, fontWeight: 900, color: THEME.blueDark }}>
              {viewType === "week" 
                ? `${formatDMY(weekDays[0])} - ${formatDMY(weekDays[5])}`
                : `${formatDMY(currentDate)}`
              }
            </div>
          </div>

          <div className="no-print" style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            marginBottom: 12,
            padding: "12px 16px",
            background: THEME.panelSoft,
            borderRadius: 8,
            border: `1px solid ${THEME.border}`
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginRight: 8 }}>
                FILTRI:
              </div>
              {["all", "booked", "confirmed", "done", "no_show", "cancelled"].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status as any)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: `1px solid ${statusFilter === status ? statusColor(status as Status) : THEME.borderSoft}`,
                    background: statusFilter === status ? statusColor(status as Status) : "#fff",
                    color: statusFilter === status ? "#fff" : THEME.text,
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 11,
                    transition: "all 0.2s",
                  }}
                >
                  {status === "all" ? "Tutti" : statusLabel(status as Status)}
                </button>
              ))}
            </div>
            
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 900, color: THEME.text }}>
                <input
                  type="checkbox"
                  checked={showAvailableOnly}
                  onChange={(e) => setShowAvailableOnly(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                Solo slot liberi
              </label>
            </div>
          </div>

          {viewType === "week" ? (
            <div
              style={{
                background: THEME.panelBg,
                border: `1px solid ${THEME.border}`,
                borderRadius: 12,
                minHeight: 600,
                overflow: "hidden",
                boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
                position: "relative",
              }}
            >
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "80px repeat(6, minmax(0, 1fr))",
                borderBottom: `1px solid ${THEME.border}`,
                background: THEME.panelSoft,
              }}>
                <div style={{ 
                  padding: "16px 8px", 
                  borderRight: `1px solid ${THEME.border}`,
                  fontSize: 12,
                  fontWeight: 900,
                  color: THEME.muted,
                  textAlign: "center",
                  boxSizing: "border-box",
                }}>
                  ORA
                </div>
                {weekDays.map((day, index) => (
                  <div 
                    key={index}
                    style={{ 
                      padding: "16px 8px", 
                      borderRight: index < 5 ? `1px solid ${THEME.border}` : "none",
                      textAlign: "center",
                      fontSize: 13,
                      fontWeight: 900,
                      color: THEME.blueDark,
                      boxSizing: "border-box",
                      width: "100%",
                      overflow: "hidden",
                    }}
                  >
                    {dayLabels[index].label}<br />
                    {formatDMY(day)}
                  </div>
                ))}
              </div>

              <div style={{ position: "relative", height: "calc(15 * 60px)" }}>
                {timeSlots.map((time, timeIndex) => (
                  <div 
                    key={timeIndex}
                    style={{ 
                      height: "60px",
                      borderBottom: `1px solid ${THEME.border}`,
                      position: "relative",
                      display: "flex",
                    }}
                  >
                    <div style={{ 
                      width: "80px",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      paddingLeft: 8,
                      borderRight: `1px solid ${THEME.border}`,
                      fontSize: 12,
                      fontWeight: 900,
                      color: THEME.muted,
                      background: THEME.panelSoft,
                      zIndex: 1,
                      flexShrink: 0,
                      boxSizing: "border-box",
                    }}>
                      {time}
                    </div>

                    {weekDays.map((day, dayIndex) => {
                      const slotStart = new Date(day);
                      const hour = parseInt(time.split(':')[0]);
                      slotStart.setHours(hour, 0, 0, 0);
                      
                      const slotEnd = new Date(slotStart.getTime() + 60 * 60000);
                      
                      const isOccupied = events.some(event => 
                        event.start.getDate() === day.getDate() &&
                        event.start.getMonth() === day.getMonth() &&
                        event.start.getFullYear() === day.getFullYear() &&
                        (
                          (event.start >= slotStart && event.start < slotEnd) ||
                          (event.end > slotStart && event.end <= slotEnd) ||
                          (event.start <= slotStart && event.end >= slotEnd)
                        )
                      );

                      return (
                        <div
                          key={`${timeIndex}-${dayIndex}`}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            height: "100%",
                            borderRight: dayIndex < 5 ? `1px solid ${THEME.border}` : "none",
                            cursor: "pointer",
                            background: showAvailableOnly ? 
                              (isOccupied ? "transparent" : "rgba(34, 197, 94, 0.05)") 
                              : "transparent",
                            boxSizing: "border-box",
                            position: "relative",
                          }}
                          onClick={() => {
                            handleSlotClick(day, hour, 0);
                          }}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => {
                            handleDrop(e, day, hour);
                          }}
                          title={`Clicca per creare appuntamento alle ${time}`}
                        />
                      );
                    })}
                  </div>
                ))}

                {filteredEvents.map((event) => {
                  const dayIndex = weekDays.findIndex(day => 
                    event.start.getDate() === day.getDate() &&
                    event.start.getMonth() === day.getMonth() &&
                    event.start.getFullYear() === day.getFullYear()
                  );

                  if (dayIndex === -1) return null;

                  const { top, height } = getEventPosition(event.start, event.end);
                  const col = statusColor(event.status);
                  const isDone = event.status === "done";
                  const isDomicile = event.location === "domicile";

                  return (
                    <div
                      key={event.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, event.id, event.start, event.end)}
                      onDragEnd={handleDragEnd}
                      style={{
                        position: "absolute",
                        left: `calc(80px + ${dayIndex} * calc((100% - 80px) / 6))`,
                        top: `${top}px`,
                        width: `calc((100% - 80px) / 6 - 4px)`,
                        height: `${Math.max(height, 30)}px`,
                        background: col,
                        color: "#fff",
                        borderRadius: 8,
                        padding: "8px",
                        boxSizing: "border-box",
                        border: `2px solid ${col}`,
                        cursor: "move",
                        zIndex: 2,
                        overflow: "hidden",
                        transition: "opacity 0.2s",
                        display: "flex",
                        flexDirection: "column",
                      }}
                      onClick={() => {
                        setSelectedEvent({
                          id: event.id,
                          title: event.patient_name,
                          patient_id: event.patient_id,
                          location: event.location,
                          clinic_site: event.clinic_site,
                          domicile_address: event.domicile_address,
                          treatment: event.treatment,
                          diagnosis: event.diagnosis,
                          amount: event.amount,
                          treatment_type: event.treatment_type,
                          price_type: event.price_type,
                        });
                        setEditStatus(event.status);
                        setEditNote(event.calendar_note || "");
                        setEditAmount(event.amount ? event.amount.toString() : "");
                        setEditTreatmentType(event.treatment_type || "seduta");
                        setEditPriceType(event.price_type || "invoiced");
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <button
                          title={isDone ? "Segna come NON eseguita" : "Segna come ESEGUITA"}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleDoneQuick(event.id, event.status);
                          }}
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            border: "2px solid rgba(255,255,255,0.9)",
                            background: isDone ? THEME.greenDark : "rgba(255,255,255,0.3)",
                            cursor: "pointer",
                            flex: "0 0 auto",
                            marginTop: 2,
                          }}
                        />

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ 
                            fontWeight: 900, 
                            lineHeight: 1.2, 
                            fontSize: 12, 
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                            {event.patient_name}
                          </div>
                          {isDomicile && (
                            <div style={{ 
                              fontSize: 10, 
                              fontWeight: 900, 
                              color: "rgba(255,255,255,0.9)",
                              marginTop: 2,
                              display: "flex",
                              alignItems: "center",
                              gap: 4
                            }}>
                              <span>🏠</span>
                              <span>DOMICILIO</span>
                            </div>
                          )}
                        </div>
                        
                        {event.status !== "done" && event.status !== "cancelled" && event.patient_phone && (
                          <button
                            title="Invia promemoria WhatsApp"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              sendReminder(event.id, event.patient_phone, event.patient_name);
                            }}
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 4,
                              border: "1px solid rgba(255,255,255,0.9)",
                              background: "rgba(37, 211, 102, 0.8)",
                              cursor: "pointer",
                              flex: "0 0 auto",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              color: "#fff",
                            }}
                          >
                            📱
                          </button>
                        )}
                      </div>

                      <div style={{ 
                        fontSize: 11, 
                        fontWeight: 900, 
                        opacity: 0.9,
                        marginTop: "auto",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-end"
                      }}>
                        <span>{fmtTime(event.start.toISOString())}</span>
                        <span>{statusLabel(event.status)}</span>
                      </div>
                    </div>
                  );
                })}
                
                {showAvailableOnly && weekDays.map((day, dayIndex) => {
                  const availableSlots = getAvailableSlots(day);
                  
                  return availableSlots.map((slot, slotIndex) => {
                    const { top, height } = getEventPosition(slot.start, slot.end);
                    
                    return (
                      <div
                        key={`slot-${dayIndex}-${slotIndex}`}
                        style={{
                          position: "absolute",
                          left: `calc(80px + ${dayIndex} * calc((100% - 80px) / 6))`,
                          top: `${top}px`,
                          width: `calc((100% - 80px) / 6 - 4px)`,
                          height: `${height}px`,
                          background: "rgba(34, 197, 94, 0.1)",
                          border: "2px dashed rgba(34, 197, 94, 0.5)",
                          borderRadius: 8,
                          cursor: "pointer",
                          zIndex: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.2s",
                        }}
                        onClick={() => {
                          const hour = slot.start.getHours();
                          const minute = slot.start.getMinutes();
                          handleSlotClick(day, hour, minute);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(34, 197, 94, 0.2)";
                          e.currentTarget.style.border = "2px solid rgba(34, 197, 94, 0.7)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(34, 197, 94, 0.1)";
                          e.currentTarget.style.border = "2px dashed rgba(34, 197, 94, 0.5)";
                        }}
                      >
                        <div style={{ 
                          fontSize: 11, 
                          fontWeight: 900, 
                          color: THEME.green,
                          textAlign: "center",
                          opacity: 0.8
                        }}>
                          {slot.time}
                        </div>
                      </div>
                    );
                  });
                })}

                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,
                    pointerEvents: "none",
                    zIndex: 3,
                  }}
                >
                  {(() => {
                    const now = currentTime;
                    const currentDayIndex = weekDays.findIndex(day => 
                      now.getDate() === day.getDate() &&
                      now.getMonth() === day.getMonth() &&
                      now.getFullYear() === day.getFullYear()
                    );
                    
                    if (currentDayIndex === -1) return null;
                    
                    const currentHour = now.getHours();
                    const currentMinute = now.getMinutes();
                    const topPosition = ((currentHour - 7) * 60 + currentMinute);
                    
                    const dayWidth = `calc((100% - 80px) / 6)`;
                    const leftPosition = `calc(80px + ${currentDayIndex} * (${dayWidth}))`;
                    
                    return (
                      <div
                        style={{
                          position: "absolute",
                          left: leftPosition,
                          top: `${topPosition}px`,
                          width: `calc(${dayWidth} - 2px)`,
                          height: "2px",
                          background: THEME.red,
                          zIndex: 4,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: "-4px",
                            transform: "translateX(-50%)",
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: THEME.red,
                          }}
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: THEME.panelBg,
                border: `1px solid ${THEME.border}`,
                borderRadius: 12,
                minHeight: 600,
                overflow: "hidden",
                boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
                position: "relative",
              }}
            >
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "80px 1fr",
                borderBottom: `1px solid ${THEME.border}`,
                background: THEME.panelSoft,
              }}>
                <div style={{ 
                  padding: "16px 8px", 
                  borderRight: `1px solid ${THEME.border}`,
                  fontSize: 12,
                  fontWeight: 900,
                  color: THEME.muted,
                  textAlign: "center",
                  boxSizing: "border-box",
                }}>
                  ORA
                </div>
                <div style={{ 
                  padding: "16px 8px", 
                  textAlign: "center",
                  fontSize: 13,
                  fontWeight: 900,
                  color: THEME.blueDark,
                  boxSizing: "border-box",
                }}>
                  {dayLabels[currentDate.getDay() === 0 ? 0 : currentDate.getDay() - 1].label} • {formatDMY(currentDate)}
                </div>
              </div>

              <div style={{ position: "relative", height: "calc(15 * 60px)" }}>
                {timeSlots.map((time, timeIndex) => {
                  const hour = parseInt(time.split(':')[0]);
                  const slotStart = new Date(currentDate);
                  slotStart.setHours(hour, 0, 0, 0);
                  
                  const slotEnd = new Date(slotStart.getTime() + 60 * 60000);
                  
                  const isOccupied = events.some(event => 
                    event.start.getDate() === currentDate.getDate() &&
                    event.start.getMonth() === currentDate.getMonth() &&
                    event.start.getFullYear() === currentDate.getFullYear() &&
                    (
                      (event.start >= slotStart && event.start < slotEnd) ||
                      (event.end > slotStart && event.end <= slotEnd) ||
                      (event.start <= slotStart && event.end >= slotEnd)
                    )
                  );

                  return (
                    <div 
                      key={timeIndex}
                      style={{ 
                        height: "60px",
                        borderBottom: `1px solid ${THEME.border}`,
                        position: "relative",
                        display: "flex",
                      }}
                    >
                      <div style={{ 
                        width: "80px",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        paddingLeft: 8,
                        borderRight: `1px solid ${THEME.border}`,
                        fontSize: 12,
                        fontWeight: 900,
                        color: THEME.muted,
                        background: THEME.panelSoft,
                        zIndex: 1,
                        flexShrink: 0,
                        boxSizing: "border-box",
                      }}>
                        {time}
                      </div>

                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: "100%",
                          cursor: "pointer",
                          background: showAvailableOnly ? 
                            (isOccupied ? "transparent" : "rgba(34, 197, 94, 0.05)") 
                            : "transparent",
                          boxSizing: "border-box",
                          position: "relative",
                        }}
                        onClick={() => {
                          handleSlotClick(currentDate, hour, 0);
                        }}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => {
                          handleDrop(e, currentDate, hour);
                        }}
                        title={`Clicca per creare appuntamento alle ${time}`}
                      />
                    </div>
                  );
                })}

                {showAvailableOnly && (() => {
                  const availableSlots = getAvailableSlots(currentDate);
                  
                  return availableSlots.map((slot, index) => {
                    const { top, height } = getEventPosition(slot.start, slot.end);
                    
                    return (
                      <div
                        key={`slot-${index}`}
                        style={{
                          position: "absolute",
                          left: "80px",
                          top: `${top}px`,
                          width: "calc(100% - 84px)",
                          height: `${height}px`,
                          background: "rgba(34, 197, 94, 0.1)",
                          border: "2px dashed rgba(34, 197, 94, 0.5)",
                          borderRadius: 8,
                          cursor: "pointer",
                          zIndex: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.2s",
                        }}
                        onClick={() => {
                          const hour = slot.start.getHours();
                          const minute = slot.start.getMinutes();
                          handleSlotClick(currentDate, hour, minute);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(34, 197, 94, 0.2)";
                          e.currentTarget.style.border = "2px solid rgba(34, 197, 94, 0.7)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(34, 197, 94, 0.1)";
                          e.currentTarget.style.border = "2px dashed rgba(34, 197, 94, 0.5)";
                        }}
                      >
                        <div style={{ 
                          fontSize: 12, 
                          fontWeight: 900, 
                          color: THEME.green,
                          textAlign: "center"
                        }}>
                          <div>🕒 {slot.time}</div>
                          <div style={{ fontSize: 10, opacity: 0.8 }}>SLOT LIBERO</div>
                        </div>
                      </div>
                    );
                  });
                })()}

                {filteredEvents
                  .filter(event => 
                    event.start.getDate() === currentDate.getDate() &&
                    event.start.getMonth() === currentDate.getMonth() &&
                    event.start.getFullYear() === currentDate.getFullYear()
                  )
                  .map((event) => {
                    const { top, height } = getEventPosition(event.start, event.end);
                    const col = statusColor(event.status);
                    const isDone = event.status === "done";
                    const isDomicile = event.location === "domicile";

                    return (
                      <div
                        key={event.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, event.id, event.start, event.end)}
                        onDragEnd={handleDragEnd}
                        style={{
                          position: "absolute",
                          left: "80px",
                          top: `${top}px`,
                          width: "calc(100% - 84px)",
                          height: `${Math.max(height, 30)}px`,
                          background: col,
                          color: "#fff",
                          borderRadius: 8,
                          padding: "8px",
                          boxSizing: "border-box",
                          border: `2px solid ${col}`,
                          cursor: "move",
                          zIndex: 2,
                          overflow: "hidden",
                          transition: "opacity 0.2s",
                          display: "flex",
                          flexDirection: "column",
                        }}
                        onClick={() => {
                          setSelectedEvent({
                            id: event.id,
                            title: event.patient_name,
                            patient_id: event.patient_id,
                            location: event.location,
                            clinic_site: event.clinic_site,
                            domicile_address: event.domicile_address,
                            treatment: event.treatment,
                            diagnosis: event.diagnosis,
                            amount: event.amount,
                            treatment_type: event.treatment_type,
                            price_type: event.price_type,
                          });
                          setEditStatus(event.status);
                          setEditNote(event.calendar_note || "");
                          setEditAmount(event.amount ? event.amount.toString() : "");
                          setEditTreatmentType(event.treatment_type || "seduta");
                          setEditPriceType(event.price_type || "invoiced");
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <button
                            title={isDone ? "Segna come NON eseguita" : "Segna come ESEGUITA"}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleDoneQuick(event.id, event.status);
                            }}
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 4,
                              border: "2px solid rgba(255,255,255,0.9)",
                              background: isDone ? THEME.greenDark : "rgba(255,255,255,0.3)",
                              cursor: "pointer",
                              flex: "0 0 auto",
                              marginTop: 2,
                            }}
                          />

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ 
                              fontWeight: 900, 
                              lineHeight: 1.2, 
                              fontSize: 12, 
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}>
                              {event.patient_name}
                            </div>
                            <div style={{ 
                              fontSize: 11, 
                              fontWeight: 900, 
                              opacity: 0.9,
                              marginTop: 2,
                            }}>
                              {fmtTime(event.start.toISOString())} - {fmtTime(event.end.toISOString())}
                            </div>
                            {isDomicile && (
                              <div style={{ 
                                fontSize: 10, 
                                fontWeight: 900, 
                                color: "rgba(255,255,255,0.9)",
                                marginTop: 2,
                                display: "flex",
                                alignItems: "center",
                                gap: 4
                              }}>
                                <span>🏠</span>
                                <span>DOMICILIO</span>
                              </div>
                            )}
                          </div>
                          
                          {event.status !== "done" && event.status !== "cancelled" && event.patient_phone && (
                            <button
                              title="Invia promemoria WhatsApp"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                sendReminder(event.id, event.patient_phone, event.patient_name);
                              }}
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 4,
                                border: "1px solid rgba(255,255,255,0.9)",
                                background: "rgba(37, 211, 102, 0.8)",
                                cursor: "pointer",
                                flex: "0 0 auto",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 10,
                                color: "#fff",
                              }}
                            >
                              📱
                            </button>
                          )}
                        </div>

                        <div style={{ 
                          fontSize: 11, 
                          fontWeight: 900, 
                          opacity: 0.9,
                          marginTop: "auto",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-end"
                        }}>
                          <span>{event.location === "studio" ? event.clinic_site : "Domicilio"}</span>
                          <span>{statusLabel(event.status)}</span>
                        </div>
                      </div>
                    );
                  })}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      right: 0,
                      bottom: 0,
                      pointerEvents: "none",
                      zIndex: 3,
                    }}
                  >
                    {(() => {
                      const now = currentTime;
                      const isToday = 
                        now.getDate() === currentDate.getDate() &&
                        now.getMonth() === currentDate.getMonth() &&
                        now.getFullYear() === currentDate.getFullYear();
                      
                      if (!isToday) return null;
                      
                      const currentHour = now.getHours();
                      const currentMinute = now.getMinutes();
                      const topPosition = ((currentHour - 7) * 60 + currentMinute);
                      
                      return (
                        <div
                          style={{
                            position: "absolute",
                            left: "80px",
                            top: `${topPosition}px`,
                            width: "calc(100% - 84px)",
                            height: "2px",
                            background: THEME.red,
                            zIndex: 4,
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left: "50%",
                              top: "-4px",
                              transform: "translateX(-50%)",
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              background: THEME.red,
                            }}
                          />
                        </div>
                      );
                    })()}
                  </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {createOpen && (
        <div
          className="no-print"
          onClick={() => setCreateOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 800,
              maxWidth: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              background: THEME.panelBg,
              color: THEME.text,
              borderRadius: 12,
              border: `1px solid ${THEME.borderSoft}`,
              boxShadow: "0 18px 60px rgba(15,23,42,0.25)",
              padding: 24,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: THEME.blueDark, letterSpacing: -0.2 }}>
                  {duplicateMode ? "Duplica appuntamento" : "Nuovo appuntamento"}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: THEME.muted, fontWeight: 900 }}>
                  {createStartISO ? `${fmtTime(createStartISO)} → ${fmtTime(createEndISO)} • ${selectedDuration} ora${selectedDuration === "1" ? "" : "e"}` : "Seleziona orario"}
                </div>
              </div>

              <button
                onClick={() => setCreateOpen(false)}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelSoft,
                  color: THEME.text,
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                  Luogo
                  <select
                    value={createLocation}
                    onChange={(e) => setCreateLocation(e.target.value as LocationType)}
                    style={{
                      width: "100%",
                      marginTop: 8,
                      padding: 12,
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelBg,
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    <option value="studio">Studio</option>
                    <option value="domicile">Domicilio</option>
                  </select>
                </label>
              </div>

              <div>
                {createLocation === "studio" ? (
                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Sede
                    <input
                      value={createClinicSite}
                      onChange={(e) => setCreateClinicSite(e.target.value)}
                      placeholder="Es. Studio Pontecorvo"
                      style={{
                        width: "100%",
                        marginTop: 8,
                        padding: 12,
                        borderRadius: 8,
                        border: `1px solid ${THEME.borderSoft}`,
                        background: THEME.panelBg,
                        color: THEME.text,
                        outline: "none",
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    />
                  </label>
                ) : (
                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Indirizzo domicilio
                    <input
                      value={createDomicileAddress}
                      onChange={(e) => setCreateDomicileAddress(e.target.value)}
                      placeholder="Via..., n..., città..."
                      style={{
                        width: "100%",
                        marginTop: 8,
                        padding: 12,
                        borderRadius: 8,
                        border: `1px solid ${THEME.borderSoft}`,
                        background: THEME.panelBg,
                        color: THEME.text,
                        outline: "none",
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    />
                  </label>
                )}
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                  {duplicateMode ? "Nuovo giorno" : "Giorno"}
                  <input
                    type="date"
                    value={duplicateMode ? duplicateDate : toDateInputValue(new Date(createStartISO))}
                    onChange={(e) => {
                      if (duplicateMode) {
                        setDuplicateDate(e.target.value);
                        updateDuplicateDateTime(e.target.value, duplicateTime);
                      } else {
                        const date = parseDateInput(e.target.value);
                        const [hours, minutes] = selectedStartTime.split(':').map(Number);
                        date.setHours(hours, minutes, 0, 0);
                        const durationHours = parseFloat(selectedDuration);
                        const endDate = new Date(date.getTime() + durationHours * 60 * 60000);
                        setCreateStartISO(date.toISOString());
                        setCreateEndISO(endDate.toISOString());
                      }
                    }}
                    style={{
                      width: "100%",
                      marginTop: 8,
                      padding: 12,
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelBg,
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  />
                </label>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                  {duplicateMode ? "Nuovo orario" : "Orario"}
                  <select
                    value={duplicateMode ? duplicateTime : selectedStartTime}
                    onChange={(e) => {
                      if (duplicateMode) {
                        setDuplicateTime(e.target.value);
                        updateDuplicateDateTime(duplicateDate, e.target.value);
                      } else {
                        setSelectedStartTime(e.target.value);
                      }
                    }}
                    style={{
                      width: "100%",
                      marginTop: 8,
                      padding: 12,
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelBg,
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    {timeSelectSlots.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                  Durata
                  <select
                    value={selectedDuration}
                    onChange={(e) => {
                      const newDuration = e.target.value as "1" | "1.5" | "2";
                      setSelectedDuration(newDuration);
                      if (duplicateMode && duplicateDate && duplicateTime) {
                        updateDuplicateDateTime(duplicateDate, duplicateTime);
                      }
                    }}
                    style={{
                      width: "100%",
                      marginTop: 8,
                      padding: 12,
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelBg,
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    <option value="1">1 ora</option>
                    <option value="1.5">1.5 ore</option>
                    <option value="2">2 ore</option>
                  </select>
                </label>
              </div>

              <div></div> {/* Spazio vuoto per allineamento */}
            </div>

            <div style={{ marginBottom: 20, border: `1px solid ${THEME.border}`, padding: 16, borderRadius: 8, background: THEME.panelSoft }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: THEME.textSoft, marginBottom: 12 }}>
                Tipologia e Prezzo
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 8 }}>
                    Trattamento
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setTreatmentType("seduta")}
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: 8,
                        border: `1px solid ${treatmentType === "seduta" ? THEME.blueDark : THEME.borderSoft}`,
                        background: treatmentType === "seduta" ? THEME.blue : "#fff",
                        color: treatmentType === "seduta" ? "#fff" : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      Seduta
                    </button>
                    <button
                      onClick={() => setTreatmentType("macchinario")}
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: 8,
                        border: `1px solid ${treatmentType === "macchinario" ? THEME.blueDark : THEME.borderSoft}`,
                        background: treatmentType === "macchinario" ? THEME.blue : "#fff",
                        color: treatmentType === "macchinario" ? "#fff" : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      Solo Macchinario
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 8 }}>
                    Prezzo
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setPriceType("invoiced")}
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: 8,
                        border: `1px solid ${priceType === "invoiced" ? THEME.greenDark : THEME.borderSoft}`,
                        background: priceType === "invoiced" ? THEME.green : "#fff",
                        color: priceType === "invoiced" ? "#fff" : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      {treatmentType === "seduta" ? "€ 40 fatturato" : "€ 25 fatturato"}
                    </button>
                    <button
                      onClick={() => setPriceType("cash")}
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: 8,
                        border: `1px solid ${priceType === "cash" ? THEME.amber : THEME.borderSoft}`,
                        background: priceType === "cash" ? "rgba(249,115,22,0.1)" : "#fff",
                        color: priceType === "cash" ? THEME.amber : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      {treatmentType === "seduta" ? "€ 35 a nero" : "€ 20 a nero"}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${THEME.border}`, paddingTop: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 12, fontWeight: 900, color: THEME.text, fontSize: 14, marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    checked={useCustomPrice}
                    onChange={(e) => {
                      setUseCustomPrice(e.target.checked);
                      if (!e.target.checked) {
                        setCustomAmount("");
                      }
                    }}
                    style={{ width: 18, height: 18 }}
                  />
                  Imposta prezzo personalizzato
                </label>

                {useCustomPrice && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: THEME.text }}>€</div>
                    <input
                      value={customAmount}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9.,]/g, '');
                        setCustomAmount(value);
                      }}
                      placeholder="Importo personalizzato"
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `1px solid ${THEME.blue}`,
                        background: "#fff",
                        color: THEME.text,
                        outline: "none",
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    />
                    <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 900 }}>
                      Inserisci l'importo in euro
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 12, fontSize: 13, color: THEME.muted, fontWeight: 900, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Totale:</span>
                <strong style={{ color: THEME.text, fontSize: 16 }}>
                  {useCustomPrice && customAmount ? 
                    `€ ${parseFloat(customAmount.replace(',', '.')).toFixed(2)}` :
                    treatmentType === "seduta" 
                      ? (priceType === "invoiced" ? "€ 40.00" : "€ 35.00")
                      : (priceType === "invoiced" ? "€ 25.00" : "€ 20.00")
                  }
                </strong>
              </div>
            </div>

            <div style={{ marginBottom: 20, border: `1px solid ${THEME.border}`, background: THEME.panelSoft, padding: 16, borderRadius: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 12, fontWeight: 900, color: THEME.text, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                Appuntamento ricorrente
              </label>

              {isRecurring && (
                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: THEME.muted }}>Giorni</div>
                    <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {dayLabels.map((d) => {
                        const active = recurringDays.includes(d.dow);
                        return (
                          <button
                            key={d.dow}
                            onClick={() => toggleRecurringDay(d.dow)}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: `1px solid ${active ? THEME.blueDark : THEME.borderSoft}`,
                              background: active ? THEME.blue : "#fff",
                              color: active ? "#fff" : THEME.text,
                              cursor: "pointer",
                              fontWeight: 900,
                              fontSize: 12,
                            }}
                            title="Seleziona/deseleziona"
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 12, fontSize: 12, color: THEME.muted, fontWeight: 900 }}>
                      Creerò un appuntamento per ogni giorno selezionato fino alla data finale.
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 13, fontWeight: 900, color: THEME.muted }}>
                      Ripeti fino a
                      <input
                        type="date"
                        value={recurringUntil}
                        onChange={(e) => setRecurringUntil(e.target.value)}
                        style={{
                          width: "100%",
                          marginTop: 8,
                          padding: 12,
                          borderRadius: 8,
                          border: `1px solid ${THEME.borderSoft}`,
                          background: "#fff",
                          color: THEME.text,
                          outline: "none",
                          fontWeight: 800,
                          fontSize: 13,
                        }}
                      />
                    </label>

                    <div style={{ marginTop: 12, fontSize: 12, color: THEME.muted, fontWeight: 900 }}>
                      Limite sicurezza: max 200 appuntamenti per inserimento.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: THEME.textSoft }}>
                  Seleziona paziente
                </div>
                <button
                  onClick={() => setQuickPatientOpen(true)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.greenDark}`,
                    background: THEME.green,
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 14 }}>➕</span>
                  Nuovo Paziente Rapido
                </button>
              </div>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca per nome o cognome (min 2 lettere)..."
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: "#fff",
                  color: THEME.text,
                  outline: "none",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              />
            </div>

            {quickPatientOpen && (
              <div style={{ 
                border: `1px solid ${THEME.blue}`, 
                background: "rgba(37, 99, 235, 0.03)", 
                padding: 16, 
                borderRadius: 8,
                marginBottom: 16 
              }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: THEME.blueDark, marginBottom: 12 }}>
                  Inserisci dati paziente rapido
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <input
                    value={quickPatientFirstName}
                    onChange={(e) => setQuickPatientFirstName(e.target.value)}
                    placeholder="Nome *"
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: "#fff",
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  />
                  <input
                    value={quickPatientLastName}
                    onChange={(e) => setQuickPatientLastName(e.target.value)}
                    placeholder="Cognome *"
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: "#fff",
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  />
                  <input
                    value={quickPatientPhone}
                    onChange={(e) => setQuickPatientPhone(e.target.value)}
                    placeholder="Telefono (opzionale)"
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: "#fff",
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  />
                </div>
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 900 }}>
                    Stato: <strong style={{ color: THEME.amber }}>DA COMPLETARE</strong>
                  </div>
                  
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setQuickPatientOpen(false)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: `1px solid ${THEME.borderSoft}`,
                        background: THEME.panelSoft,
                        color: THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      Annulla
                    </button>
                    <button
                      onClick={createQuickPatient}
                      disabled={creatingQuickPatient || !quickPatientFirstName.trim() || !quickPatientLastName.trim()}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: `1px solid ${THEME.greenDark}`,
                        background: THEME.green,
                        color: "#fff",
                        cursor: creatingQuickPatient ? "not-allowed" : "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                        opacity: creatingQuickPatient || !quickPatientFirstName.trim() || !quickPatientLastName.trim() ? 0.6 : 1,
                      }}
                    >
                      {creatingQuickPatient ? "Creazione..." : "Crea Paziente"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ border: `1px solid ${THEME.border}`, background: "#fff", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: 12, fontSize: 13, color: THEME.muted, fontWeight: 900, background: THEME.panelSoft }}>
                {searching ? "Ricerca in corso..." : `Risultati: ${patientResults.length}`}
              </div>

              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {patientResults.length === 0 && !quickPatientOpen && (
                  <div style={{ padding: 20, fontSize: 13, color: THEME.muted, fontWeight: 900, textAlign: "center" }}>
                    {q.trim().length < 2 ? "Scrivi almeno 2 lettere per iniziare la ricerca" : "Nessun risultato trovato"}
                  </div>
                )}

                {patientResults.map((p) => {
                  const active = selectedPatient?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPatient(p)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: 16,
                        border: "none",
                        borderTop: `1px solid ${THEME.border}`,
                        background: active ? "rgba(37, 99, 235, 0.08)" : "#fff",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        fontWeight: 900,
                        color: THEME.text,
                        fontSize: 13,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                        <span style={{ fontSize: 14 }}>
                          {p.last_name} {p.first_name}
                        </span>
                        {p.treatment && (
                          <span style={{ fontSize: 12, color: THEME.muted, marginTop: 4, fontWeight: 900 }}>
                            Trattamento: {p.treatment}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 900 }}>{p.phone ?? ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 16, fontSize: 13, color: THEME.muted, fontWeight: 900 }}>
              Selezionato:{" "}
              <strong style={{ color: THEME.text }}>
                {selectedPatient ? `${selectedPatient.last_name} ${selectedPatient.first_name}` : "-"}
              </strong>
              {selectedPatient && selectedPatient.treatment && (
                <span style={{ marginLeft: 16 }}>
                  • Trattamento: <strong style={{ color: THEME.text }}>{selectedPatient.treatment}</strong>
                </span>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button
                onClick={() => setCreateOpen(false)}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelSoft,
                  color: THEME.text,
                  cursor: "pointer",
                  fontWeight: 900,
                  minWidth: 120,
                  fontSize: 13,
                }}
              >
                Annulla
              </button>

              <button
                onClick={() => setShowWhatsAppConfirm(true)}
                disabled={creating || !selectedPatient}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid ${THEME.greenDark}`,
                  background: THEME.green,
                  color: "#fff",
                  cursor: creating || !selectedPatient ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  minWidth: 200,
                  opacity: creating || !selectedPatient ? 0.6 : 1,
                  fontSize: 13,
                }}
              >
                {creating ? "Creazione..." : isRecurring ? "Crea ricorrenza" : "Crea appuntamento"}
              </button>
            </div>
          </div>
        </div>
      )}


        {showWhatsAppConfirm && (
        <>
          <div
            className="no-print"
            onClick={() => setShowWhatsAppConfirm(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.35)",
              zIndex: 10000,
            }}
          />
          
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 500,
              maxWidth: "90%",
              background: THEME.panelBg,
              color: THEME.text,
              borderRadius: 12,
              border: `1px solid ${THEME.borderSoft}`,
              boxShadow: "0 18px 60px rgba(15,23,42,0.25)",
              padding: 24,
              zIndex: 10001,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div style={{ fontSize: 24 }}>📱</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: THEME.blueDark }}>
                  {selectedPatient?.phone ? "Invia conferma WhatsApp?" : "Nessun numero di telefono"}
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: THEME.muted, fontWeight: 900 }}>
                  {selectedPatient?.phone 
                    ? "Vuoi inviare il messaggio di conferma al paziente?"
                    : "Il paziente non ha un numero di telefono registrato. Vuoi comunque creare l'appuntamento?"}
                </div>
              </div>
            </div>

            {selectedPatient?.phone && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: THEME.text, marginBottom: 8 }}>
                  Messaggio che verrà inviato:
                </div>
                <div style={{
                  background: THEME.panelSoft,
                  padding: 16,
                  borderRadius: 8,
                  border: `1px solid ${THEME.border}`,
                  fontSize: 12,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  maxHeight: 150,
                  overflowY: "auto",
                }}>
                  Grazie per averci scelto.
                  Ricordiamo il prossimo appuntamento fissato per {formatDateRelative(new Date(createStartISO))} alle {fmtTime(createStartISO)}.

                  A presto,
                  Dr. Marco Turchetta
                  Fisioterapia e Osteopatia
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: THEME.muted, fontWeight: 900 }}>
                  Destinatario: {selectedPatient?.phone}
                </div>
              </div>
            )}

            {!selectedPatient?.phone && (
              <div style={{ marginBottom: 24 }}>
                <div style={{
                  background: "rgba(249, 115, 22, 0.1)",
                  border: `1px solid ${THEME.amber}`,
                  padding: 16,
                  borderRadius: 8,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: THEME.amber,
                  fontWeight: 900,
                }}>
                  ⚠️ Attenzione: Il paziente {selectedPatient?.last_name} {selectedPatient?.first_name} non ha un numero di telefono registrato.
                  <br /><br />
                  Puoi comunque creare l'appuntamento e successivamente aggiungere il numero di telefono nella scheda paziente.
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                onClick={async () => {
                  setShowWhatsAppConfirm(false);
                  await createAppointment(false);
                }}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelSoft,
                  color: THEME.text,
                  cursor: "pointer",
                  fontWeight: 900,
                  minWidth: 120,
                  fontSize: 13,
                }}
              >
                {selectedPatient?.phone ? "Salta" : "Crea senza WhatsApp"}
              </button>
              
              {selectedPatient?.phone && (
                <button
                  onClick={async () => {
                    setShowWhatsAppConfirm(false);
                    await createAppointment(true);
                  }}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.greenDark}`,
                    background: "#25d366",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                    minWidth: 200,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>📱</span>
                  Crea e invia WhatsApp
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {selectedEvent && (
        <div
          className="no-print"
          onClick={() => setSelectedEvent(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 700,
              maxWidth: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              background: THEME.panelBg,
              color: THEME.text,
              borderRadius: 12,
              border: `1px solid ${THEME.borderSoft}`,
              boxShadow: "0 18px 60px rgba(15,23,42,0.25)",
              padding: 24,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: THEME.blueDark, letterSpacing: -0.2 }}>{selectedEvent.title}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: THEME.muted, fontWeight: 900 }}>
                  Stato: <strong style={{ color: statusColor(editStatus) }}>{statusLabel(editStatus)}</strong>
                  {selectedEvent.location === "domicile" && (
                    <span style={{ marginLeft: 12, color: THEME.amber, fontWeight: 900 }}>🏠 DOMICILIO</span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedEvent(null)}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelSoft,
                  color: THEME.text,
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <button
                onClick={() => {
                  const event = events.find(e => e.id === selectedEvent.id);
                  if (event) {
                    openCreateModal(event.start, event.start.getHours(), event.start.getMinutes(), event);
                    setSelectedEvent(null);
                  }
                }}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: `1px solid ${THEME.blueDark}`,
                  background: THEME.blue,
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>📋</span>
                Duplica
              </button>
            </div>

            <div style={{ marginBottom: 20, border: `1px solid ${THEME.border}`, padding: 16, borderRadius: 8, background: THEME.panelSoft }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: THEME.textSoft, marginBottom: 12 }}>
                Trattamento e Prezzo
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 8 }}>
                    Trattamento
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setEditTreatmentType("seduta")}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `1px solid ${editTreatmentType === "seduta" ? THEME.blueDark : THEME.borderSoft}`,
                        background: editTreatmentType === "seduta" ? THEME.blue : "#fff",
                        color: editTreatmentType === "seduta" ? "#fff" : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      Seduta
                    </button>
                    <button
                      onClick={() => setEditTreatmentType("macchinario")}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `1px solid ${editTreatmentType === "macchinario" ? THEME.blueDark : THEME.borderSoft}`,
                        background: editTreatmentType === "macchinario" ? THEME.blue : "#fff",
                        color: editTreatmentType === "macchinario" ? "#fff" : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      Solo Macchinario
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 8 }}>
                    Fatturazione
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setEditPriceType("invoiced")}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `1px solid ${editPriceType === "invoiced" ? THEME.greenDark : THEME.borderSoft}`,
                        background: editPriceType === "invoiced" ? THEME.green : "#fff",
                        color: editPriceType === "invoiced" ? "#fff" : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      Fatturato
                    </button>
                    <button
                      onClick={() => setEditPriceType("cash")}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `1px solid ${editPriceType === "cash" ? THEME.amber : THEME.borderSoft}`,
                        background: editPriceType === "cash" ? "rgba(249,115,22,0.1)" : "#fff",
                        color: editPriceType === "cash" ? THEME.amber : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      A nero
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 8 }}>
                  Importo (€)
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={editAmount}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.,]/g, '');
                      setEditAmount(value);
                    }}
                    placeholder="Importo personalizzato (lasciare vuoto per prezzo standard)"
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.blue}`,
                      background: "#fff",
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  />
                  <button
                    onClick={() => {
                      const standardPrice = editTreatmentType === "seduta" 
                        ? (editPriceType === "invoiced" ? "40" : "35")
                        : (editPriceType === "invoiced" ? "25" : "20");
                      setEditAmount(standardPrice);
                    }}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelSoft,
                      color: THEME.text,
                      cursor: "pointer",
                      fontWeight: 900,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Usa standard
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: THEME.muted, fontWeight: 900 }}>
                  {editAmount ? `Totale: € ${parseFloat(editAmount.replace(',', '.')).toFixed(2)}` : 
                   `Prezzo standard: € ${editTreatmentType === "seduta" 
                     ? (editPriceType === "invoiced" ? "40.00" : "35.00")
                     : (editPriceType === "invoiced" ? "25.00" : "20.00")}`}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 900, color: THEME.textSoft, marginBottom: 8 }}>
                  Stato
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as Status)}
                    style={{
                      width: "100%",
                      marginTop: 8,
                      padding: 12,
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: "#fff",
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    <option value="booked">Prenotato</option>
                    <option value="confirmed">Confermato</option>
                    <option value="done">Eseguito</option>
                    <option value="no_show">Non Pagata</option>
                    <option value="cancelled">Annullato</option>
                  </select>
                </label>
              </div>

              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: THEME.textSoft, marginBottom: 8 }}>
                  Promemoria
                </div>
                <button
                  onClick={() => {
                    const event = events.find(e => e.id === selectedEvent.id);
                    if (event) {
                      sendReminder(event.id, event.patient_phone, event.patient_name);
                    }
                  }}
                  disabled={!events.find(e => e.id === selectedEvent.id)?.patient_phone}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.greenDark}`,
                    background: "#25d366",
                    color: "#fff",
                    cursor: events.find(e => e.id === selectedEvent.id)?.patient_phone ? "pointer" : "not-allowed",
                    fontWeight: 900,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    opacity: events.find(e => e.id === selectedEvent.id)?.patient_phone ? 1 : 0.6,
                  }}
                >
                  <span>📱</span>
                  Invia promemoria WhatsApp
                </button>
              </div>
            </div>

            <label style={{ display: "block", fontSize: 14, fontWeight: 900, color: THEME.textSoft, marginBottom: 20 }}>
              Nota
              <textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: "#fff",
                  color: THEME.text,
                  outline: "none",
                  resize: "vertical",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              />
            </label>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
              <button
                onClick={deleteAppointment}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid rgba(220,38,38,0.40)`,
                  background: "rgba(220,38,38,0.08)",
                  color: THEME.red,
                  cursor: "pointer",
                  fontWeight: 900,
                  minWidth: 120,
                  fontSize: 13,
                }}
              >
                Elimina
              </button>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link
                  href={selectedEvent.patient_id ? `/patients/${selectedEvent.patient_id}` : "#"}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.borderSoft}`,
                    background: THEME.panelSoft,
                    color: THEME.text,
                    fontWeight: 900,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    minWidth: 170,
                    justifyContent: "center",
                    opacity: selectedEvent.patient_id ? 1 : 0.5,
                    pointerEvents: selectedEvent.patient_id ? "auto" : "none",
                    fontSize: 13,
                  }}
                >
                  Scheda paziente
                </Link>

                <button
                  onClick={saveAppointment}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.greenDark}`,
                    background: THEME.green,
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                    minWidth: 140,
                    fontSize: 13,
                  }}
                >
                  Salva modifiche
                </button>
              </div>
            </div>

            <div style={{ marginTop: 16, fontSize: 12, color: THEME.muted, fontWeight: 900 }}>
              Nota: "Annullato" mantiene lo storico · "Elimina" rimuove dal DB.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}