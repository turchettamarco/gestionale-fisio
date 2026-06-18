// src/lib/contabilita/tsTipiSpesa.ts
// ═══════════════════════════════════════════════════════════════════════
// Catalogo dei codici "tipologia di spesa" del Sistema Tessera Sanitaria
// (tracciato dati spesa 730 / D.Lgs. 175/2014).
//
// ⚠️ IMPORTANTE: i codici e il loro significato vanno SEMPRE confermati con
// il proprio commercialista e con il tracciato XSD vigente sul portale
// sistemats.it. Questa lista e' una guida operativa, non una certificazione.
//
// Per fisioterapista / osteopata la prestazione professionale tipica ricade
// di norma sotto "SP". "AD" si usa per la cessione/affitto di dispositivi
// medici (es. tutori, ortesi). Verificare il caso concreto.
// ═══════════════════════════════════════════════════════════════════════

export type TipoSpesa = {
  code: string;
  label: string;
  hint?: string;
};

export const TIPI_SPESA: TipoSpesa[] = [
  { code: "SP", label: "Prestazione sanitaria (professionista)", hint: "Prestazione resa da professionista sanitario (caso tipico fisio/osteo)" },
  { code: "SR", label: "Spese prestazioni sanitarie (altre)", hint: "Altre spese per prestazioni sanitarie" },
  { code: "AD", label: "Dispositivo medico (acquisto/affitto)", hint: "Tutori, ortesi, ausili marcati CE" },
  { code: "TK", label: "Ticket", hint: "Quota fissa / ticket su prestazioni specialistiche" },
  { code: "IC", label: "Spese chirurgiche", hint: "Interventi chirurgici" },
];

export const TIPO_SPESA_CODES = TIPI_SPESA.map((t) => t.code);

export function labelTipoSpesa(code: string | null | undefined): string {
  if (!code) return "—";
  const found = TIPI_SPESA.find((t) => t.code === code);
  return found ? `${found.code} · ${found.label}` : code;
}
