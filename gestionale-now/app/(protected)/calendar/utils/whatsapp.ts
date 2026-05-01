// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/utils/whatsapp.ts
// ═══════════════════════════════════════════════════════════════════════
// Ora re-esporta dalla utility centrale (src/lib/whatsapp.ts).
// I nomi vecchi sono mantenuti per compatibilità con il codice esistente.
// ═══════════════════════════════════════════════════════════════════════

export { normalizePhoneForWA, openWhatsApp } from "@/src/lib/whatsapp";

// Alias legacy per non rompere gli import esistenti nel calendar
export { normalizePhoneForWA as cleanPhoneForWA } from "@/src/lib/whatsapp";
