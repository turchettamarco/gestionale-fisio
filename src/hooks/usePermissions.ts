// ═══════════════════════════════════════════════════════════════════════
// src/hooks/usePermissions.ts — permessi dell'utente loggato (mig. 071)
// ═══════════════════════════════════════════════════════════════════════
// Wrapper su StudioContext: legge il membro corrente e ne risolve i
// permessi effettivi. Da usare in qualunque pagina per nascondere dati o
// funzioni non consentite.
//
//   const { can, isOwner, perms } = usePermissions();
//   {can("patient.phone") && <TelefonoPaziente />}
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useMemo } from "react";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import {
  resolvePermissions,
  maskPatientName,
  type PermissionKey,
} from "@/src/lib/permissions";

export function usePermissions() {
  const { member } = useCurrentStudio();

  const perms = useMemo(
    () => resolvePermissions(member as never),
    [member]
  );

  const role = (member?.role ?? "therapist") as string;
  const isOwner = role === "owner" || role === "co_owner";

  return useMemo(() => ({
    /** Insieme dei permessi effettivi. */
    perms,
    /** True se il permesso è concesso. */
    can: (key: PermissionKey) => perms.has(key),
    /** Titolare o co-titolare: accesso pieno. */
    isOwner,
    role,
    /** Nome del paziente mascherato in iniziali se non consentito. */
    maskName: (fullName: string) => maskPatientName(fullName, perms),
    /** True finché il contesto non ha caricato il membro. */
    ready: member != null,
  }), [perms, isOwner, role, member]);
}
