import { Suspense } from "react";
import ContabilitaClient from "./ContabilitaClient";

export default function ContabilitaPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontWeight: 900 }}>Caricamento contabilità…</div>}>
      <ContabilitaClient />
    </Suspense>
  );
}
