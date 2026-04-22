"use client";
// src/contexts/ProtectedProviders.tsx
// Wrapper client-side che avvolge tutto ciò che è sotto (protected) con il StudioProvider.
// Deve stare in un file separato "use client" perché il layout (protected)/layout.tsx
// è server-component (fa redirect se non autenticato).

import { ReactNode } from "react";
import { StudioProvider } from "./StudioContext";

export default function ProtectedProviders({ children }: { children: ReactNode }) {
  return <StudioProvider>{children}</StudioProvider>;
}
