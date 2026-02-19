"use client";
type Props = any;

import React from "react";
import Link from "next/link";

export default function CalendarGrid(props: any) {
  const {
    THEME,
    statusColor,
    statusLabel,
    normalizeStatus,
    normalizeTreatmentType,
    normalizePriceType,
    toggleDoneQuick,
    weeklyExpectedRevenue,
    startOfISOWeekMonday,
    addDays,
    formatDMY,
    getAvailabilityForecast,
    fmtTime,
    pad2,
    dayLabels,
    draggingOver,
    event,
    exportAppointments,
    exportToGoogleCalendar,
    exportToPDF,
    printCalendar,
    filteredEvents,
    getEventPosition,
    getAvailableSlots,
    getEventColor,
    autoNameFontSize,
    filters,
    filtersExpanded,
    error,
    loading,
    setFiltersExpanded,
    setFilters,
    goToNextWeek,
    gotoWeekStart,
    goToPreviousWeek,
    goToToday,
    handleDragEnd,
    handleDragStart,
    handleContextMenu,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleLogout,
    sendReminder,
    handleSlotClick,
    height,
    loadPatientFromEvent,
    printMenuOpen,
    printMenuRef,
    currentDate,
    setCurrentDate,
    currentTime,
    setQuickActionsMenu,
    setSelectedEvent,
    setEditStatus,
    setEditNote,
    setEditAmount,
    setEditTreatmentType,
    setEditPriceType,
    setViewType,
    setShowAllUpcoming,
    setPrintMenuOpen,
    showAllUpcoming,
    showAvailableOnly,
    setShowAvailableOnly,
    sidebarRef,
    stats,
    statusFilter,
    setStatusFilter,
    timeSlots,
    todaysAppointments,
    top,
    userInitials,
    userMenuOpen,
    userMenuRef,
    setUserMenuOpen,
    viewType,
    weekDays,
    weekOptions
    } = props;

  const todaysAppointmentsAny = (todaysAppointments as any[]) || [];
  const filteredEventsAny = (filteredEvents as any[]) || [];

  return (
    <>
<aside
        ref={sidebarRef}
        className={`no-print sidebar-scroll ${showAllUpcoming ? "show-scrollbar" : ""}`}
        style={{
          width: 300,
          background: THEME.panelBg,
          borderRight: `1px solid ${THEME.border}`,
          padding: 16,
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
  <div style={{ fontSize: 18, fontWeight: 900, color: THEME.blueDark, letterSpacing: -0.2 }}>FisioHub</div>

  <div ref={userMenuRef} style={{ position: "relative" }}>
    <button
      type="button"
      onClick={() => setUserMenuOpen((v: boolean) => !v)}
      title="Account"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        background: "white",
        borderRadius: 14,
        border: `1px solid ${THEME.border}`,
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          background: "linear-gradient(135deg, #0d9488, #2563eb)",
          color: "white",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 900,
          fontSize: 11,
        }}
      >
        {userInitials}
      </span>
      <span style={{ fontSize: 12, fontWeight: 900, color: THEME.textSoft }}>Marco</span>
      <span style={{ color: THEME.gray, fontSize: 12 }}>{userMenuOpen ? "▴" : "▾"}</span>
    </button>

    {userMenuOpen && (
      <div
        style={{
          position: "absolute",
          right: 0,
          top: "calc(100% + 10px)",
          width: 220,
          background: "white",
          border: `1px solid ${THEME.border}`,
          borderRadius: 14,
          boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
          overflow: "hidden",
          zIndex: 60,
        }}
      >
        <Link
          href="/settings"
          onClick={() => setUserMenuOpen(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            color: THEME.text,
            textDecoration: "none",
            fontWeight: 800,
            fontSize: 13,
            borderBottom: `1px solid ${THEME.border}`,
          }}
        >
          <span>⚙️</span> Impostazioni
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            background: "white",
            border: "none",
            cursor: "pointer",
            color: THEME.red,
            fontWeight: 900,
            fontSize: 13,
          }}
        >
          <span>⏻</span> Logout
        </button>
      </div>
    )}
  </div>
</div>

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
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
          <Link href="/reports" style={{ 
            color: THEME.blueDark, 
            fontWeight: 800, 
            textDecoration: "none",
            display: "flex", 
            alignItems: "center", 
            gap: 8,
          }}>
            📊 Report
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

        {/* Sezione Appuntamenti Imminenti */}
        <div style={{ marginTop: 30, borderTop: `1px solid ${THEME.border}`, paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
              🕐 Appuntamenti imminenti
            </div>
            <div style={{
              fontSize: 11,
              fontWeight: 900,
              color: "#fff",
              background: THEME.blue,
              padding: "4px 8px",
              borderRadius: 12
            }}>
              {(() => {
                const now = new Date();
                const upcoming = todaysAppointmentsAny.filter((a: any) => a.end > now);
                return upcoming.length;
              })()}
            </div>
          </div>

          {(() => {
            const now = new Date();
            const upcomingAll = todaysAppointments
              .filter((a: any) => a.end > now) // sparisce quando finisce
              .sort((a: any, b: any) => a.start.getTime() - b.start.getTime());

            const nextFuture = upcomingAll.find((a: any) => a.start > now) || null;
            const list = showAllUpcoming ? upcomingAll : upcomingAll.slice(0, 5);
            const remaining = Math.max(0, upcomingAll.length - 5);

            const timeStyle = (status: "past" | "current" | "next") => ({
              fontSize: 12,
              fontWeight: 800,
              padding: "3px 6px",
              borderRadius: 6,
              minWidth: 52,
              textAlign: "center" as const,
              border:
                status === "current"
                  ? "2px solid #16a34a"
                  : status === "next"
                  ? "2px solid #2563eb"
                  : "1px solid #cbd5e1",
              color:
                status === "current"
                  ? "#16a34a"
                  : status === "next"
                  ? "#2563eb"
                  : "#334155",
              background:
                status === "current"
                  ? "rgba(22,163,74,0.08)"
                  : status === "next"
                  ? "rgba(37,99,235,0.08)"
                  : "#f8fafc",
            });

            if (upcomingAll.length === 0) {
              return (
                <div style={{
                  textAlign: "center",
                  padding: "20px 12px",
                  background: THEME.panelSoft,
                  borderRadius: 8,
                  border: `1px solid ${THEME.border}`
                }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: THEME.muted, marginBottom: 4 }}>
                    Nessun appuntamento imminente
                  </div>
                  <div style={{ fontSize: 11, color: THEME.muted }}>
                    Oggi non ci sono altri appuntamenti in arrivo
                  </div>
                </div>
              );
            }

            return (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: showAllUpcoming ? "520px" : "none", overflowY: showAllUpcoming ? "auto" : "hidden" }}>
                  {filteredEventsAny.map((appointment) => {
                    const isNow = appointment.start <= now && appointment.end >= now;
                    const isNext = !isNow && nextFuture && nextFuture.id === appointment.id;

                    return (
                      <div
                        key={appointment.id}
                        style={{
                          background: isNow ? "rgba(37, 99, 235, 0.1)" : "#fff",
                          border: `1px solid ${isNow ? THEME.blue : THEME.border}`,
                          borderRadius: 8,
                          padding: 10,
                          cursor: "pointer",
                          transition: "all 0.2s",
                          position: "relative",
                          overflow: "visible",
                        }}
                        onClick={() => {
                          setQuickActionsMenu(null);
                          setSelectedEvent({
                            id: appointment.id,
                            title: appointment.patient_name,
                            patient_id: appointment.patient_id,
                            location: appointment.location,
                            clinic_site: appointment.clinic_site,
                            domicile_address: appointment.domicile_address,
                            treatment: appointment.treatment,
                            diagnosis: appointment.diagnosis,
                            amount: appointment.amount,
                            treatment_type: appointment.treatment_type,
                            price_type: appointment.price_type,
                            start: appointment.start,
                            end: appointment.end,
                          });
                          setEditStatus(appointment.status);
                          setEditNote(appointment.calendar_note || "");
                          setEditAmount(appointment.amount !== undefined && appointment.amount !== null ? appointment.amount.toString() : "");
                          setEditTreatmentType(appointment.treatment_type || "seduta");
                          setEditPriceType(appointment.price_type || "invoiced");
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "translateY(-2px)";
                          e.currentTarget.style.boxShadow = "0 4px 12px rgba(15,23,42,0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        <div style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: 4,
                          height: "100%",
                          background: statusColor(appointment.status)
                        }} />

                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginLeft: 4 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              marginBottom: 4
                            }}>
                              <div style={timeStyle(isNow ? "current" : isNext ? "next" : "past")}>
                                {fmtTime(appointment.start.toISOString())}
                              </div>

                              {isNow && (
                                <div style={{
                                  fontSize: 10,
                                  fontWeight: 900,
                                  color: "#fff",
                                  background: "#16a34a",
                                  padding: "2px 6px",
                                  borderRadius: 4
                                }}>
                                  IN CORSO
                                </div>
                              )}

                              {isNext && (
                                <div style={{
                                  fontSize: 10,
                                  fontWeight: 900,
                                  color: "#fff",
                                  background: "#2563eb",
                                  padding: "2px 6px",
                                  borderRadius: 4
                                }}>
                                  PROSSIMO
                                </div>
                              )}
                            </div>

                            <div style={{
                              fontSize: 13,
                              fontWeight: 900,
                              color: THEME.text,
                              lineHeight: 1.35,
                              marginBottom: 4
                            }}>
                              {appointment.patient_name}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <div style={{
                                fontSize: 10,
                                fontWeight: 900,
                                color: THEME.muted,
                                display: "flex",
                                alignItems: "center",
                                gap: 2
                              }}>
                                <div style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  background: statusColor(appointment.status)
                                }} />
                                {statusLabel(appointment.status)}
                              </div>

                              {appointment.location === "domicile" && (
                                <div style={{
                                  fontSize: 10,
                                  fontWeight: 900,
                                  color: THEME.amber,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 2
                                }}>
                                  🏠 Domicilio
                                </div>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDoneQuick(appointment.id, appointment.status);
                            }}
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 4,
                              border: `2px solid ${appointment.status === "done" ? THEME.greenDark : THEME.border}`,
                              background: appointment.status === "done" ? THEME.greenDark : "transparent",
                              cursor: "pointer",
                              flex: "0 0 auto",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              color: "#fff",
                            }}
                            title={appointment.status === "done" ? "Segna come non eseguito" : "Segna come eseguito"}
                          >
                            {appointment.status === "done" && "✓"}
                          </button>
                        </div>

                        {appointment.calendar_note && (
                          <div style={{
                            marginTop: 8,
                            fontSize: 11,
                            color: THEME.muted,
                            fontStyle: "italic",
                            paddingLeft: 4,
                            borderLeft: `2px solid ${THEME.borderSoft}`
                          }}>
                            {appointment.calendar_note}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {remaining > 0 && !showAllUpcoming && (
                  <button
                    type="button"
                    onClick={() => setShowAllUpcoming(true)}
                    style={{
                      marginTop: 12,
                      width: "100%",
                      border: `1px solid ${THEME.border}`,
                      background: "#fff",
                      borderRadius: 10,
                      padding: "8px 10px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 900,
                      color: THEME.blue,
                      textAlign: "center",
                    }}
                    title="Mostra tutti gli appuntamenti imminenti di oggi"
                  >
                    +{remaining} altri oggi
                  </button>
                )}

                {showAllUpcoming && upcomingAll.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllUpcoming(false)}
                    style={{
                      marginTop: 12,
                      width: "100%",
                      border: `1px solid ${THEME.border}`,
                      background: THEME.panelSoft,
                      borderRadius: 10,
                      padding: "8px 10px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 900,
                      color: THEME.muted,
                      textAlign: "center",
                    }}
                    title="Mostra solo i primi 5"
                  >
                    Mostra meno
                  </button>
                )}

                <div style={{ marginTop: 16, fontSize: 11, color: THEME.muted, textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Completati: {todaysAppointmentsAny.filter((a: any) => a.status === "done").length}</span>
                    <span>Prenotati: € {Math.round(weeklyExpectedRevenue).toLocaleString("it-IT")}</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </aside>

      <main className="print-wrap" style={{ flex: 1, display: "flex", flexDirection: "column", padding: 24, minWidth: 0 }}>
        <div style={{ width: "100%" }}>
          <div className={`no-print sidebar-scroll ${showAllUpcoming ? "show-scrollbar" : ""}`} style={{ 
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
                Dr. Turchetta Marco
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
                  {weekOptions.map((o: any) => (
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
                      overflow: "visible",
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
                    <button
                      onClick={exportToPDF}
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
                      📄 Esporta PDF
                    </button>
                    <button
                      onClick={exportToGoogleCalendar}
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
                      🗓️ Esporta Google Calendar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div
              className={`no-print sidebar-scroll ${showAllUpcoming ? "show-scrollbar" : ""}`}
              style={{
                marginTop: 12,
                marginBottom: 16,
                background: "rgba(220,38,38,0.08)",
                border: "1px solid rgba(220,38,38,0.22)",
                color: THEME.red,
                padding: 10,
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

          <div className={`no-print sidebar-scroll ${showAllUpcoming ? "show-scrollbar" : ""}`} style={{ 
  marginBottom: 12,
  padding: "16px",
  background: THEME.panelBg,
  borderRadius: 8,
  border: `1px solid ${THEME.border}`
}}>
  <div 
    onClick={() => setFiltersExpanded(!filtersExpanded)}
    style={{ 
      fontSize: 14, 
      fontWeight: 900, 
      color: THEME.textSoft, 
      marginBottom: filtersExpanded ? 12 : 0,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }}
  >
    <span>🎛️ Filtri Avanzati</span>
    <span style={{ fontSize: 12 }}>{filtersExpanded ? "▲" : "▼"}</span>
  </div>
  
  {filtersExpanded && (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 4 }}>Luogo📍 </div>
          <select
            value={filters.location}
            onChange={(e) => setFilters((prev: any) => ({ ...prev, location: e.target.value as any }))}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${THEME.borderSoft}`,
              background: "#fff",
              fontSize: 12,
              fontWeight: 900,
              color: THEME.text,
            }}
          >
            <option value="all">Tutti i luoghi</option>
            <option value="studio">Studio</option>
            <option value="domicile">Domicilio</option>
          </select>
        </div>
        
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 4 }}>Trattamento</div>
          <select
            value={filters.treatmentType}
            onChange={(e) => setFilters((prev: any) => ({ ...prev, treatmentType: e.target.value as any }))}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${THEME.borderSoft}`,
              background: "#fff",
              fontSize: 12,
              fontWeight: 900,
              color: THEME.text,
            }}
          >
            <option value="all">Tutti i trattamenti</option>
            <option value="seduta">Seduta</option>
            <option value="macchinario">Macchinario</option>
          </select>
        </div>
        
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 4 }}>Importo Min</div>
          <input
            type="number"
            value={filters.minAmount}
            onChange={(e) => setFilters((prev: any) => ({ ...prev, minAmount: e.target.value }))}
            placeholder="€ Min"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${THEME.borderSoft}`,
              background: "#fff",
              fontSize: 12,
              fontWeight: 900,
            }}
          />
        </div>
        
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 4 }}>Importo Max</div>
          <input
            type="number"
            value={filters.maxAmount}
            onChange={(e) => setFilters((prev: any) => ({ ...prev, maxAmount: e.target.value }))}
            placeholder="€ Max"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${THEME.borderSoft}`,
              background: "#fff",
              fontSize: 12,
              fontWeight: 900,
            }}
          />
        </div>
      </div>
      
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted }}>
          {filteredEvents.length} eventi trovati
        </div>
        <button
          onClick={() => setFilters({
            location: "all",
            treatmentType: "all",
            priceType: "all",
            minAmount: "",
            maxAmount: "",
          })}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: `1px solid ${THEME.borderSoft}`,
            background: THEME.panelSoft,
            color: THEME.text,
            fontSize: 12,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Reset Filtri
        </button>
      </div>
    </>
  )}
</div>

          <div className={`no-print sidebar-scroll ${showAllUpcoming ? "show-scrollbar" : ""}`} style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center", 
            marginBottom: 16,
            padding: "12px 16px",
            background: THEME.panelBg,
            borderRadius: 8,
            border: `1px solid ${THEME.border}`,
            top: 0,
            zIndex: 9,
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
                    onClick={() => setCurrentDate((prev: any) => addDays(prev, -1))}
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
                    onClick={() => setCurrentDate((prev: any) => addDays(prev, 1))}
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
                  📊 € {Math.round(weeklyExpectedRevenue).toLocaleString("it-IT")}
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

            <div style={{ fontSize: 13, fontWeight: 900, color: THEME.blueDark }}>
              {viewType === "week" 
                ? `${formatDMY(weekDays[0])} - ${formatDMY(weekDays[5])}`
                : `${formatDMY(currentDate)}`
              }
            </div>
          </div>

          <div className={`no-print sidebar-scroll ${showAllUpcoming ? "show-scrollbar" : ""}`} style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            marginBottom: 12,
            padding: "12px 16px",
            background: THEME.panelSoft,
            borderRadius: 8,
            border: `1px solid ${THEME.border}`,
                      }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginRight: 8 }}>
                FILTRI STATO:
              </div>
              {["all", "booked", "confirmed", "done", "not_paid", "cancelled"]
.map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status as any)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: `1px solid ${statusFilter === status ? statusColor(status) : THEME.borderSoft}`,
                    background: statusFilter === status ? statusColor(status) : "#fff",
                    color: statusFilter === status ? "#fff" : THEME.text,
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 11,
                    transition: "all 0.2s",
                  }}
                >
                  {status === "all" ? "Tutti" : statusLabel(status)}
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
                overflow: "visible",
                boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
                position: "relative",
              }}
            >
              <div style={{ 
  display: "grid", 
  gridTemplateColumns: "80px repeat(6, minmax(0, 1fr))",
  borderBottom: `1px solid ${THEME.border}`,
  background: THEME.panelSoft,
  position: "sticky",
  top: 0,
  zIndex: 8,
}}>
  <div style={{ 
    padding: "12px 8px", 
    borderRight: `1px solid ${THEME.border}`,
    fontSize: 12,
    fontWeight: 900,
    color: THEME.muted,
    textAlign: "center",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  }}>
    ORA
  </div>
  {weekDays.map((day: any, index: number) => {
    const forecast = getAvailabilityForecast(day);
    return (
      <div 
        key={index}
        style={{ 
          padding: "8px 4px", 
          borderRight: index < 5 ? `1px solid ${THEME.border}` : "none",
          textAlign: "center",
          fontSize: 12,
          fontWeight: 900,
          color: THEME.blueDark,
          boxSizing: "border-box",
          width: "100%",
          overflow: "visible",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          minHeight: "60px", // Altezza minima aumentata
        }}
      >
        <div style={{ marginBottom: 2 }}>
          {dayLabels[index].label}
        </div>
        <div style={{ fontSize: 11, marginBottom: 4 }}>
          {formatDMY(day)}
        </div>
        <div style={{
          fontSize: 9,
          fontWeight: 900,
          color: forecast.occupancyRate > 80 ? THEME.red : 
                 forecast.occupancyRate > 60 ? THEME.amber : THEME.green,
          opacity: 0.9,
          lineHeight: 1.2,
          padding: "2px 4px",
          background: forecast.occupancyRate > 80 ? "rgba(220,38,38,0.1)" : 
                     forecast.occupancyRate > 60 ? "rgba(249,115,22,0.1)" : "rgba(22,163,74,0.1)",
          borderRadius: 4,
          margin: "0 2px",
        }}>
          {forecast.totalEvents} appt • {forecast.recommendation}
        </div>
      </div>
    );
  })}
</div>

              <div style={{ position: "relative", height: "calc(15 * 60px)", overflowY: "auto" }}>
                <div style={{ position: "relative", minHeight: "100%" }}>
                  {timeSlots.map((time: any, timeIndex: number) => (
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
                        position: "sticky",
                        left: 0,
                      }}>
                        {time}
                      </div>

                      {weekDays.map((day: any, dayIndex: number) => {
                        const hour = parseInt(time.split(':')[0]);
                        
                        return (
                          <div
                            key={`${timeIndex}-${dayIndex}`}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              height: "100%",
                              borderRight: dayIndex < 5 ? `1px solid ${THEME.border}` : "none",
                              boxSizing: "border-box",
                              position: "relative",
                            }}
                          >
                            {/* Slot 00-30 minuti */}
                            <div
                              style={{
                                height: "30px",
                                borderBottom: `1px solid ${THEME.border}`,
                                cursor: "pointer",
                                boxSizing: "border-box",
                                position: "relative",
                              }}
                              onClick={() => {
                                handleSlotClick(day, hour, 0);
                              }}
                              onContextMenu={(e) => handleContextMenu(e)}
                              onDragOver={(e) => handleDragOver(e, dayIndex, hour, 0)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => {
                                handleDrop(e, day, hour, 0);
                              }}
                              title={`Clicca per creare appuntamento alle ${pad2(hour)}:00`}
                            >
                              {draggingOver && draggingOver.dayIndex === dayIndex && 
                               draggingOver.hour === hour && draggingOver.minute === 0 && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    border: `2px dashed ${THEME.blue}`,
                                    background: "rgba(37, 99, 235, 0.1)",
                                    zIndex: 1,
                                    pointerEvents: "none",
                                  }}
                                />
                              )}
                            </div>
                            
                            {/* Slot 30-60 minuti */}
                            <div
                              style={{
                                height: "30px",
                                cursor: "pointer",
                                boxSizing: "border-box",
                                position: "relative",
                              }}
                              onClick={() => {
                                handleSlotClick(day, hour, 30);
                              }}
                              onContextMenu={(e) => handleContextMenu(e)}
                              onDragOver={(e) => handleDragOver(e, dayIndex, hour, 30)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => {
                                handleDrop(e, day, hour, 30);
                              }}
                              title={`Clicca per creare appuntamento alle ${pad2(hour)}:30`}
                            >
                              {draggingOver && draggingOver.dayIndex === dayIndex && 
                               draggingOver.hour === hour && draggingOver.minute === 30 && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    border: `2px dashed ${THEME.blue}`,
                                    background: "rgba(37, 99, 235, 0.1)",
                                    zIndex: 1,
                                    pointerEvents: "none",
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {filteredEvents.map((event: any) => {
                    const dayIndex = weekDays.findIndex((day: any) => 
                      event.start.getDate() === day.getDate() &&
                      event.start.getMonth() === day.getMonth() &&
                      event.start.getFullYear() === day.getFullYear()
                    );

                    if (dayIndex === -1) return null;

                    const { top, height } = getEventPosition(event.start, event.end);
                    const col = getEventColor(event);
                    const isDone = event.status === "done";
                    const isDomicile = event.location === "domicile";
                    const isPaid = !!event.is_paid;
                    const waSent = !!event.whatsapp_sent_at;

                    return (
                      <div
                        key={event.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, event.id, event.start, event.end)}
                        onDragEnd={handleDragEnd}
                        onContextMenu={(e) => handleContextMenu(e, event)}
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
                          overflow: "visible",
                          transition: "opacity 0.2s",
                          display: "flex",
                          flexDirection: "column",
                        }}
                        onClick={() => {
                          setSelectedEvent({
                            id: event.id,
                            title: event.patient_name,
                            patient_id: event.patient_id,
                            location: (event.location === "domicile" || event.location === "studio") ? event.location : undefined,
                            clinic_site: event.clinic_site,
                            domicile_address: event.domicile_address,
                            treatment: event.treatment,
                            diagnosis: event.diagnosis,
                            amount: event.amount,
                            treatment_type: event.treatment_type ?? undefined,
                            price_type: event.price_type ?? undefined,
                            start: event.start,
                            end: event.end,
                          });
                          setEditStatus(normalizeStatus(event.status));
                          setEditNote(event.calendar_note || "");
                          setEditAmount(event.amount !== undefined && event.amount !== null ? event.amount.toString() : "");
                          setEditTreatmentType(normalizeTreatmentType(event.treatment_type));
                          setEditPriceType(normalizePriceType(event.price_type));
                          
                          if (event.patient_id) {
                            loadPatientFromEvent(event.patient_id);
                          }
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <button
                            title={isDone ? "Segna come NON eseguita" : "Segna come ESEGUITA"}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleDoneQuick(event.id, normalizeStatus(event.status));
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
                            <div
                            title={event.location === "domicile" ? `🏠 ${event.patient_name}` : event.patient_name}
                            style={{
                              fontWeight: 900,
                              lineHeight: 1.12,
                              fontSize: autoNameFontSize(event.patient_name),
                              overflow: "hidden",
                              // massimo 2 righe senza spostare il layout
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical" as any,
                              maxHeight: 26,
                              wordBreak: "break-word",
                            }}
                          >
                            {event.location === "domicile" ? `🏠 ${event.patient_name}` : event.patient_name}
                          </div>
</div>
                          
                          {isPaid ? (
                            <div
                              title="Pagato"
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 6,
                                border: "1px solid rgba(255,255,255,0.9)",
                                background: "rgba(255,255,255,0.25)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 12,
                                color: "#fff",
                                flex: "0 0 auto",
                              }}
                            >
                              💰
                            </div>
                          ) : waSent ? (
                            <div
                              title="WhatsApp inviato"
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 6,
                                border: "1px solid rgba(255,255,255,0.6)",
                                background: "rgba(255,255,255,0.18)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flex: "0 0 auto",
                              }}
                            >
                              <div style={{ width: 8, height: 8, borderRadius: 999, background: "rgba(255,255,255,0.95)" }} />
                            </div>
                          ) : event.status !== "done" && event.status !== "cancelled" && event.patient_phone ? (
                            <button
                              title="Invia promemoria WhatsApp"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                sendReminder(event.id, event.patient_phone ?? undefined, event.patient_first_name ?? undefined);
                              }}
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 6,
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
                          ) : null}
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
                  
                  {showAvailableOnly && weekDays.map((day: any, dayIndex: number) => {
                    const availableSlots = getAvailableSlots(day);
                    
                    return availableSlots.map((slot: any, slotIndex: number) => {
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
                      const currentDayIndex = weekDays.findIndex((day: any) => 
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
            </div>
          ) : (
            <div
              style={{
                background: THEME.panelBg,
                border: `1px solid ${THEME.border}`,
                borderRadius: 12,
                minHeight: 600,
                overflow: "visible",
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
                {timeSlots.map((time: any, timeIndex: number) => {
                  const hour = parseInt(time.split(':')[0]);
                  
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

                      <div style={{
                        flex: 1,
                        minWidth: 0,
                        height: "100%",
                        boxSizing: "border-box",
                        position: "relative",
                      }}>
                        {/* Slot 00-30 minuti */}
                        <div
                          style={{
                            height: "30px",
                            borderBottom: `1px solid ${THEME.border}`,
                            cursor: "pointer",
                            boxSizing: "border-box",
                            position: "relative",
                          }}
                          onClick={() => {
                            handleSlotClick(currentDate, hour, 0);
                          }}
                          onContextMenu={(e) => handleContextMenu(e)}
                          onDragOver={(e) => handleDragOver(e, 0, hour, 0)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => {
                            handleDrop(e, currentDate, hour, 0);
                          }}
                          title={`Clicca per creare appuntamento alle ${pad2(hour)}:00`}
                        >
                          {draggingOver && draggingOver.dayIndex === 0 && 
                           draggingOver.hour === hour && draggingOver.minute === 0 && (
                            <div
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                border: `2px dashed ${THEME.blue}`,
                                background: "rgba(37, 99, 235, 0.1)",
                                zIndex: 1,
                                pointerEvents: "none",
                              }}
                            />
                          )}
                        </div>
                        
                        {/* Slot 30-60 minuti */}
                        <div
                          style={{
                            height: "30px",
                            cursor: "pointer",
                            boxSizing: "border-box",
                            position: "relative",
                          }}
                          onClick={() => {
                            handleSlotClick(currentDate, hour, 30);
                          }}
                          onContextMenu={(e) => handleContextMenu(e)}
                          onDragOver={(e) => handleDragOver(e, 0, hour, 30)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => {
                            handleDrop(e, currentDate, hour, 30);
                          }}
                          title={`Clicca per creare appuntamento alle ${pad2(hour)}:30`}
                        >
                          {draggingOver && draggingOver.dayIndex === 0 && 
                           draggingOver.hour === hour && draggingOver.minute === 30 && (
                            <div
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                border: `2px dashed ${THEME.blue}`,
                                background: "rgba(37, 99, 235, 0.1)",
                                zIndex: 1,
                                pointerEvents: "none",
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {showAvailableOnly && (() => {
                  const availableSlots = getAvailableSlots(currentDate);
                  
                  return availableSlots.map((slot: any, index: number) => {
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
                  .filter((event: any) => 
                    event.start.getDate() === currentDate.getDate() &&
                    event.start.getMonth() === currentDate.getMonth() &&
                    event.start.getFullYear() === currentDate.getFullYear()
                  )
                  .map((event: any) => {
                    const { top, height } = getEventPosition(event.start, event.end);
                    const col = getEventColor(event);
                    const isDone = event.status === "done";
                    const isDomicile = event.location === "domicile";

                    return (
                      <div
                        key={event.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, event.id, event.start, event.end)}
                        onDragEnd={handleDragEnd}
                        onContextMenu={(e) => handleContextMenu(e, event)}
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
                          overflow: "visible",
                          transition: "opacity 0.2s",
                          display: "flex",
                          flexDirection: "column",
                        }}
                        onClick={() => {
                          setSelectedEvent({
                            id: event.id,
                            title: event.patient_name,
                            patient_id: event.patient_id,
                            location: (event.location === "domicile" || event.location === "studio") ? event.location : undefined,
                            clinic_site: event.clinic_site,
                            domicile_address: event.domicile_address,
                            treatment: event.treatment,
                            diagnosis: event.diagnosis,
                            amount: event.amount,
                            treatment_type: event.treatment_type ?? undefined,
                            price_type: event.price_type ?? undefined,
                            start: event.start,
                            end: event.end,
                          });
                          setEditStatus(normalizeStatus(event.status));
                          setEditNote(event.calendar_note || "");
                          setEditAmount(event.amount !== undefined && event.amount !== null ? event.amount.toString() : "");
                          setEditTreatmentType(normalizeTreatmentType(event.treatment_type));
                          setEditPriceType(normalizePriceType(event.price_type));
                          
                          if (event.patient_id) {
                            loadPatientFromEvent(event.patient_id);
                          }
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <button
                            title={isDone ? "Segna come NON eseguita" : "Segna come ESEGUITA"}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleDoneQuick(event.id, normalizeStatus(event.status));
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
                              overflow: "visible",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}>
                              {event.location === "domicile" ? `🏠 ${event.patient_name}` : event.patient_name}
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
                                sendReminder(event.id, event.patient_phone ?? undefined, event.patient_first_name ?? undefined);
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
    </>
  );
}





















































