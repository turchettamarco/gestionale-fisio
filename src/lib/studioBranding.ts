// ═══════════════════════════════════════════════════════════════════════
// src/lib/studioBranding.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Helper UNICO per ottenere il "branding" di firma usato in tutte le
// comunicazioni rivolte al paziente: WhatsApp, PDF, email, modali Google
// Review, GDPR, ecc.
//
// REGOLA:
//   • Multi-operatore (multi_operator_enabled = true)
//       → signatureName = studio.name (es. "Studio Fisiobin")
//         signatureTitle = null
//     Motivo: il paziente non sa con quale operatore vede chi gli scrive.
//     Il messaggio sembra arrivare dallo studio nel suo complesso.
//
//   • Single-operator (default storico)
//       → signatureName = studio.signature_name (es. "Dr. Marco Turchetta")
//         signatureTitle = studio.signature_title (es. "Fisioterapista")
//     Comportamento storico immutato.
//
// Dove usarlo:
//   • buildReminderMessage / template WhatsApp
//   • PDF di esercizi, GDPR, lettere
//   • Email da/firma
//   • Dialog "Chiedi recensione Google"
//
// Dove NON usarlo:
//   • Pagina Settings dove il proprietario vede/modifica la firma
//     (lì serve il dato grezzo del DB).
// ═══════════════════════════════════════════════════════════════════════

export type StudioBrandingInput = {
  name?: string | null;
  signature_name?: string | null;
  signature_title?: string | null;
  multi_operator_enabled?: boolean | null;
} | null | undefined;

export type StudioBranding = {
  /** Nome firma da usare in chiusura messaggi/documenti */
  signatureName: string | null;
  /** Sottotitolo professionale (es. "Fisioterapista"). null in multi-op. */
  signatureTitle: string | null;
};

/**
 * Restituisce il branding di firma per uno studio. Applica la regola
 * multi-op vs single-op definita sopra.
 *
 * Se lo studio è null/undefined, restituisce campi null (i template
 * gestiscono già questo caso con `Cordiali saluti` generico).
 */
export function getStudioBranding(studio: StudioBrandingInput): StudioBranding {
  if (!studio) {
    return { signatureName: null, signatureTitle: null };
  }
  if (studio.multi_operator_enabled === true) {
    // Multi-op: firma = nome studio, niente titolo professionale
    return {
      signatureName: studio.name?.trim() || null,
      signatureTitle: null,
    };
  }
  // Single-op: comportamento storico
  return {
    signatureName: studio.signature_name?.trim() || null,
    signatureTitle: studio.signature_title?.trim() || null,
  };
}
