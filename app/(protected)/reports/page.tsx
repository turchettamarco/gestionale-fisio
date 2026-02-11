import { Suspense } from "react";
import ReportsClient from "./ReportsClient";

export default function ReportsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontWeight: 900 }}>Caricamento report…</div>}>
      <ReportsClient />
    </Suspense>
  );
}
