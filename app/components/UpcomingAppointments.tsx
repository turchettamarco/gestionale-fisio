"use client";

import { useEffect, useMemo, useState } from "react";

type Appointment = {
  id: string;
  patient_name: string;
  start_time: string; // ISO string
  end_time: string;   // ISO string
};

type Props = {
  appointments: Appointment[];
};

export default function UpcomingAppointments({ appointments }: Props) {
  const [now, setNow] = useState<Date>(new Date());

  // aggiorna l'orario ogni 60 secondi
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  // filtra solo appuntamenti FUTURI
  const upcomingAppointments = useMemo(() => {
    return appointments
      .filter(a => new Date(a.end_time) > now)
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() -
          new Date(b.start_time).getTime()
      );
  }, [appointments, now]);

  if (upcomingAppointments.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500">
        Nessun appuntamento imminente
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <h3 className="px-4 py-2 font-semibold text-sm border-b">
        Appuntamenti imminenti
      </h3>

      {/* CONTENITORE SCROLLABILE */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        {upcomingAppointments.map((a, index) => {
          const start = new Date(a.start_time);
          const end = new Date(a.end_time);

          const isNext = index === 0;

          return (
            <div
              key={a.id}
              className={`rounded-lg p-3 border ${
                isNext
                  ? "bg-blue-50 border-blue-400"
                  : "bg-white border-gray-200"
              }`}
            >
              <div className="font-medium truncate">
                {a.patient_name}
              </div>

              <div className="text-xs text-gray-600">
                {start.toLocaleTimeString("it-IT", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" - "}
                {end.toLocaleTimeString("it-IT", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>

              {isNext && (
                <div className="mt-1 text-xs font-semibold text-blue-600">
                  Prossimo appuntamento
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
