"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";


type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
};

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone")
        .order("last_name", { ascending: true });

      if (error) {
        setError(error.message);
      } else {
        setPatients(data ?? []);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Lista Pazienti</h1>

      {loading && <p>Caricamento…</p>}
      {error && <p style={{ color: "red" }}>Errore: {error}</p>}

      {!loading && patients.length === 0 && (
        <p>Nessun paziente inserito.</p>
      )}

      <ul>
        {patients.map((p) => (
          <li key={p.id}>
            <strong>
              {p.last_name} {p.first_name}
            </strong>
            {p.phone && ` — ${p.phone}`}
          </li>
        ))}
      </ul>
    </main>
  );
}
