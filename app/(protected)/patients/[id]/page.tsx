"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

// ─── Pain Map ─────────────────────────────────────────────────────────────────

const PAIN_TYPES_PM = [
  { id:"burning",   label:"Bruciante",  emoji:"🔥", color:"#ef4444" },
  { id:"throbbing", label:"Pulsante",   emoji:"💗", color:"#f97316" },
  { id:"dull",      label:"Sordo",      emoji:"🔵", color:"#3b82f6" },
  { id:"sharp",     label:"Acuto",      emoji:"⚡", color:"#a855f7" },
  { id:"stiff",     label:"Rigidità",   emoji:"🔒", color:"#64748b" },
  { id:"numb",      label:"Formicolio", emoji:"〜", color:"#06b6d4" },
];

const PM_VIEWS = ["front","back","left","right"] as const;
type PMView = typeof PM_VIEWS[number];
const PM_VIEW_LABELS: Record<PMView,string> = { front:"Fronte", back:"Retro", left:"Lat. Sx", right:"Lat. Dx" };

const PM_GRID = 60;
const PM_ROWS = 150;

const PM_ANATOMY: Record<PMView, Array<{n:string;x:number;y:number}>> = {
  front:[
    {n:"Testa",x:50,y:9},{n:"Collo",x:50,y:17},{n:"Spalla sin.",x:16,y:24},{n:"Spalla des.",x:84,y:24},
    {n:"Petto",x:50,y:31},{n:"Addome",x:50,y:47},{n:"Braccio sin.",x:9,y:43},{n:"Braccio des.",x:91,y:43},
    {n:"Avamb. sin.",x:8,y:63},{n:"Avamb. des.",x:92,y:63},{n:"Coscia sin.",x:32,y:80},{n:"Coscia des.",x:68,y:80},
    {n:"Gamba sin.",x:33,y:93},{n:"Gamba des.",x:67,y:93},
  ],
  back:[
    {n:"Occipite",x:50,y:9},{n:"Cervicale",x:50,y:17},{n:"Trapezio sin.",x:20,y:24},{n:"Trapezio des.",x:80,y:24},
    {n:"Dorsale",x:50,y:35},{n:"Lombare",x:50,y:56},{n:"Gluteo sin.",x:34,y:70},{n:"Gluteo des.",x:66,y:70},
    {n:"Polp. sin.",x:33,y:93},{n:"Polp. des.",x:67,y:93},
  ],
  left:[
    {n:"Testa",x:50,y:9},{n:"Collo",x:50,y:17},{n:"Petto",x:65,y:30},{n:"Schiena",x:28,y:38},
    {n:"Addome",x:60,y:50},{n:"Anca",x:58,y:67},{n:"Coscia",x:50,y:80},{n:"Gamba",x:45,y:93},
  ],
  right:[
    {n:"Testa",x:50,y:9},{n:"Collo",x:50,y:17},{n:"Petto",x:35,y:30},{n:"Schiena",x:72,y:38},
    {n:"Addome",x:40,y:50},{n:"Anca",x:42,y:67},{n:"Coscia",x:50,y:80},{n:"Gamba",x:55,y:93},
  ],
};

const BodyFrontM = () => (
  <svg viewBox="0 0 200 500" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
    <ellipse cx="100" cy="38" rx="30" ry="35" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <ellipse cx="86" cy="30" rx="5" ry="7" fill="#fff" stroke="#94a3b8" strokeWidth="1"/>
    <ellipse cx="114" cy="30" rx="5" ry="7" fill="#fff" stroke="#94a3b8" strokeWidth="1"/>
    <circle cx="86" cy="30" r="2.5" fill="#475569"/><circle cx="114" cy="30" r="2.5" fill="#475569"/>
    <path d="M90 50 Q100 58 110 50" stroke="#94a3b8" strokeWidth="1.2" fill="none"/>
    <rect x="87" y="72" width="26" height="18" rx="5" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M32 112 Q28 88 87 88 L113 88 Q172 88 168 112 L163 245 Q163 255 100 257 Q37 255 37 245 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M100 108 L100 250" stroke="#cbd5e1" strokeWidth="0.8" strokeDasharray="4,4"/>
    <line x1="55" y1="128" x2="145" y2="128" stroke="#cbd5e1" strokeWidth="0.6" strokeDasharray="3,3"/>
    <ellipse cx="56" cy="106" rx="15" ry="8" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1"/>
    <ellipse cx="144" cy="106" rx="15" ry="8" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1"/>
    <path d="M32 112 Q10 128 8 172 Q5 212 16 238 Q20 250 30 248 Q40 246 38 224 L36 168 L42 118 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M168 112 Q190 128 192 172 Q195 212 184 238 Q180 250 170 248 Q160 246 162 224 L164 168 L158 118 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <ellipse cx="22" cy="260" rx="14" ry="17" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <ellipse cx="178" cy="260" rx="14" ry="17" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M37 245 Q32 268 34 294 Q38 312 54 318 Q70 324 76 296 L80 258 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M163 245 Q168 268 166 294 Q162 312 146 318 Q130 324 124 296 L120 258 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M34 294 Q30 342 32 374 Q34 388 50 392 Q66 396 70 374 L74 300 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M166 294 Q170 342 168 374 Q166 388 150 392 Q134 396 130 374 L126 300 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <ellipse cx="50" cy="400" rx="20" ry="10" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <ellipse cx="150" cy="400" rx="20" ry="10" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M32 374 Q28 420 30 448" stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
    <path d="M168 374 Q172 420 170 448" stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
    <ellipse cx="42" cy="454" rx="24" ry="10" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <ellipse cx="158" cy="454" rx="24" ry="10" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <ellipse cx="100" cy="192" rx="8" ry="8" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" opacity="0.6"/>
  </svg>
);

const BodyFrontF = () => (
  <svg viewBox="0 0 200 500" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
    <ellipse cx="100" cy="38" rx="27" ry="35" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
    <ellipse cx="87" cy="30" rx="4.5" ry="6.5" fill="#fff" stroke="#c084fc" strokeWidth="1"/>
    <ellipse cx="113" cy="30" rx="4.5" ry="6.5" fill="#fff" stroke="#c084fc" strokeWidth="1"/>
    <circle cx="87" cy="30" r="2.2" fill="#a78bfa"/><circle cx="113" cy="30" r="2.2" fill="#a78bfa"/>
    <path d="M91 52 Q100 60 109 52" stroke="#c084fc" strokeWidth="1.2" fill="none"/>
    <rect x="88" y="72" width="24" height="16" rx="4" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
    <path d="M40 112 Q36 88 88 88 L112 88 Q164 88 160 112 L156 230 Q148 248 100 252 Q52 248 44 230 Z" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
    <path d="M100 108 L100 248" stroke="#e9d5ff" strokeWidth="0.8" strokeDasharray="4,4"/>
    <ellipse cx="62" cy="106" rx="13" ry="7" fill="#f3e8ff" stroke="#c084fc" strokeWidth="1" opacity="0.7"/>
    <ellipse cx="138" cy="106" rx="13" ry="7" fill="#f3e8ff" stroke="#c084fc" strokeWidth="1" opacity="0.7"/>
    <ellipse cx="80" cy="155" rx="12" ry="15" fill="#f3e8ff" stroke="#c084fc" strokeWidth="1" opacity="0.8"/>
    <ellipse cx="120" cy="155" rx="12" ry="15" fill="#f3e8ff" stroke="#c084fc" strokeWidth="1" opacity="0.8"/>
    <path d="M40 112 Q20 128 18 172 Q15 208 26 234 Q30 246 40 244 Q50 242 48 220 L46 168 L50 118 Z" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
    <path d="M160 112 Q180 128 182 172 Q185 208 174 234 Q170 246 160 244 Q150 242 152 220 L154 168 L150 118 Z" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
    <ellipse cx="26" cy="256" rx="13" ry="16" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
    <ellipse cx="174" cy="256" rx="13" ry="16" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
    <path d="M44 230 Q38 255 36 278 Q34 305 50 320 Q64 334 80 330 L84 258 Z" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
    <path d="M156 230 Q162 255 164 278 Q166 305 150 320 Q136 334 120 330 L116 258 Z" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
    <path d="M36 278 Q30 330 32 362 Q34 378 50 382 Q66 386 70 362 L74 285 Z" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
    <path d="M164 278 Q170 330 168 362 Q166 378 150 382 Q134 386 130 362 L126 285 Z" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
    <ellipse cx="50" cy="390" rx="20" ry="10" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
    <ellipse cx="150" cy="390" rx="20" ry="10" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
    <path d="M32 362 Q28 415 30 445" stroke="#c084fc" strokeWidth="1.5" fill="none"/>
    <path d="M168 362 Q172 415 170 445" stroke="#c084fc" strokeWidth="1.5" fill="none"/>
    <ellipse cx="42" cy="451" rx="24" ry="10" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
    <ellipse cx="158" cy="451" rx="24" ry="10" fill="#fdf4ff" stroke="#c084fc" strokeWidth="1.5"/>
  </svg>
);

const BodyBackM = () => (
  <svg viewBox="0 0 200 500" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
    <ellipse cx="100" cy="38" rx="30" ry="35" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <rect x="87" y="72" width="26" height="18" rx="5" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M32 112 Q28 88 87 88 L113 88 Q172 88 168 112 L163 245 Q163 255 100 257 Q37 255 37 245 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M100 88 L100 250" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="5,4"/>
    <path d="M52 98 Q44 130 48 160 Q54 172 64 166 Q74 160 70 130 L68 98 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" opacity="0.7"/>
    <path d="M148 98 Q156 130 152 160 Q146 172 136 166 Q126 160 130 130 L132 98 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" opacity="0.7"/>
    {[118,138,158,178,198,218].map((y,i) => <ellipse key={i} cx="100" cy={y} rx="7" ry="5.5" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" opacity="0.5"/>)}
    <path d="M32 112 Q10 128 8 172 Q5 212 16 238 Q20 250 30 248 Q40 246 38 224 L36 168 L42 118 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M168 112 Q190 128 192 172 Q195 212 184 238 Q180 250 170 248 Q160 246 162 224 L164 168 L158 118 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <ellipse cx="22" cy="260" rx="14" ry="17" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <ellipse cx="178" cy="260" rx="14" ry="17" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M37 245 Q32 268 34 294 Q38 312 54 318 Q70 324 76 296 L80 258 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M163 245 Q168 268 166 294 Q162 312 146 318 Q130 324 124 296 L120 258 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M34 294 Q30 342 32 374 Q34 388 50 392 Q66 396 70 374 L74 300 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M166 294 Q170 342 168 374 Q166 388 150 392 Q134 396 130 374 L126 300 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <ellipse cx="50" cy="400" rx="20" ry="10" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <ellipse cx="150" cy="400" rx="20" ry="10" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M32 374 Q28 420 30 448" stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
    <path d="M168 374 Q172 420 170 448" stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
    <ellipse cx="42" cy="454" rx="24" ry="10" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
    <ellipse cx="158" cy="454" rx="24" ry="10" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
  </svg>
);

const BodySideComp = ({ flip = false, female = false }: {flip?:boolean;female?:boolean}) => {
  const fill = female ? "#fdf4ff" : "#f1f5f9";
  const stroke = female ? "#c084fc" : "#94a3b8";
  return (
    <svg viewBox="0 0 140 500" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{width:"100%",height:"100%",display:"block",transform:flip?"scaleX(-1)":"none"}}>
      <ellipse cx="68" cy="38" rx="26" ry="33" fill={fill} stroke={stroke} strokeWidth="1.5"/>
      <ellipse cx="80" cy="30" rx="5" ry="7" fill="#fff" stroke={stroke} strokeWidth="1"/>
      <circle cx="80" cy="30" r="2.5" fill={female?"#a78bfa":"#475569"}/>
      <path d="M76 60 Q90 68 88 75" stroke={stroke} strokeWidth="1" fill="none"/>
      <rect x="60" y="70" width="20" height="16" rx="4" fill={fill} stroke={stroke} strokeWidth="1.5"/>
      <path d="M28 108 Q26 88 60 86 L80 86 Q112 88 116 108 L114 238 Q114 248 72 250 Q30 248 28 238 Z" fill={fill} stroke={stroke} strokeWidth="1.5"/>
      <path d="M116 108 Q130 122 132 158 Q134 192 126 220 Q122 236 116 234 Q108 232 110 212 L112 170 L118 114 Z" fill={fill} stroke={stroke} strokeWidth="1.5"/>
      {female && <ellipse cx="92" cy="145" rx="14" ry="16" fill={fill} stroke={stroke} strokeWidth="1" opacity="0.8"/>}
      <ellipse cx="120" cy="248" rx="11" ry="14" fill={fill} stroke={stroke} strokeWidth="1.5"/>
      <path d="M28 238 Q24 258 26 282 Q30 298 44 304 Q58 310 62 284 L64 248 Z" fill={fill} stroke={stroke} strokeWidth="1.5"/>
      <path d="M26 282 Q22 328 24 360 Q26 374 38 376 Q52 378 56 358 L58 284 Z" fill={fill} stroke={stroke} strokeWidth="1.5"/>
      <path d="M62 284 Q80 264 96 272 Q110 282 104 308 Q100 324 86 326 Q68 326 62 306 Z" fill={fill} stroke={stroke} strokeWidth="1.5"/>
      <path d="M90 322 Q92 358 90 382 Q88 394 76 396 Q64 398 62 382 L60 328 Z" fill={fill} stroke={stroke} strokeWidth="1.5"/>
      <path d="M24 360 Q20 400 22 428" stroke={stroke} strokeWidth="1.5" fill="none"/>
      <ellipse cx="32" cy="434" rx="18" ry="8" fill={fill} stroke={stroke} strokeWidth="1.5"/>
      <ellipse cx="76" cy="400" rx="18" ry="8" fill={fill} stroke={stroke} strokeWidth="1.5"/>
      <path d="M90 382 Q94 410 92 432" stroke={stroke} strokeWidth="1.5" fill="none"/>
      <ellipse cx="82" cy="438" rx="17" ry="7" fill={fill} stroke={stroke} strokeWidth="1.5"/>
    </svg>
  );
};

type PMZoneData = { painType: string; intensity: number };
type PMZones = Record<PMView, Record<string, PMZoneData>>;
type PMArrow = { id: number; view: PMView; x1: number; y1: number; x2: number; y2: number; label: string };

function PainMapCanvasSection({ canvasW, canvasH, zones, view, arrowStart, arrows, showLabels, onMouseDown, onMouseMove, onMouseUp, onMouseLeave }: any) {
  const paintRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = paintRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, canvasW, canvasH);
    const cw = canvasW / PM_GRID, ch = canvasH / PM_ROWS;
    Object.entries(zones[view] as Record<string, PMZoneData>).forEach(([key, { painType: pt, intensity: intv }]) => {
      const [cx, cy] = key.split(",").map(Number);
      const cfg = PAIN_TYPES_PM.find(p => p.id === pt) || PAIN_TYPES_PM[0];
      const alpha = intv === 1 ? 0.32 : intv === 2 ? 0.6 : 0.85;
      ctx.fillStyle = cfg.color + Math.round(alpha * 255).toString(16).padStart(2, "0");
      ctx.fillRect(cx * cw, cy * ch, cw + 0.8, ch + 0.8);
    });
  }, [zones, view, canvasW, canvasH]);

  const vArrows = arrows.filter((a: PMArrow) => a.view === view);
  const anats = showLabels ? (PM_ANATOMY[view as PMView] || []) : [];

  return (
    <div style={{ position:"relative", width:canvasW, height:canvasH, flexShrink:0 }}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}>
      <canvas ref={paintRef} width={canvasW} height={canvasH}
        style={{ position:"absolute", inset:0, zIndex:2, mixBlendMode:"multiply", cursor:"crosshair", userSelect:"none" }}/>
      {/* Etichette anatomiche */}
      {anats.map((a: {n:string;x:number;y:number}, i: number) => (
        <div key={i} style={{ position:"absolute", left:`${a.x}%`, top:`${a.y}%`, transform:"translate(-50%,-50%)",
          fontSize:9, fontWeight:700, color:"rgba(15,23,42,0.38)", whiteSpace:"nowrap", pointerEvents:"none", zIndex:3 }}>
          {a.n}
        </div>
      ))}
      {/* SVG frecce irradiazione */}
      <svg viewBox={`0 0 ${canvasW} ${canvasH}`} style={{ position:"absolute", inset:0, width:canvasW, height:canvasH, zIndex:4, pointerEvents:"none" }}>
        <defs>
          <marker id="pmah" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 Z" fill="#1e40af"/>
          </marker>
        </defs>
        {arrowStart && (
          <circle cx={arrowStart.x * canvasW} cy={arrowStart.y * canvasH} r="7" fill="#f97316" stroke="#fff" strokeWidth="2"/>
        )}
        {vArrows.map((a: PMArrow) => {
          const x1=a.x1*canvasW, y1=a.y1*canvasH, x2=a.x2*canvasW, y2=a.y2*canvasH;
          const mx=(x1+x2)/2, my=(y1+y2)/2;
          return (
            <g key={a.id}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1e40af" strokeWidth="2.2" strokeDasharray="7,4" markerEnd="url(#pmah)" opacity="0.9"/>
              {a.label && <>
                <rect x={mx - a.label.length*3.5 - 4} y={my-10} width={a.label.length*7+8} height={15} rx={4} fill="rgba(255,255,255,0.92)"/>
                <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="700" fill="#1e3a8a" fontFamily="system-ui">{a.label}</text>
              </>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function PMiniCanvas({ zones, view }: { zones: Record<string,PMZoneData>; view: PMView }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0,0,40,80);
    const cw=40/PM_GRID, ch=80/PM_ROWS;
    Object.entries(zones||{}).forEach(([key,{painType:pt,intensity:intv}]) => {
      const [cx,cy]=key.split(",").map(Number);
      const cfg=PAIN_TYPES_PM.find(p=>p.id===pt)||PAIN_TYPES_PM[0];
      const alpha=intv===1?.35:intv===2?.62:.88;
      ctx.fillStyle=cfg.color+Math.round(alpha*255).toString(16).padStart(2,"0");
      ctx.fillRect(cx*cw,cy*ch,cw+.5,ch+.5);
    });
  },[zones]);
  return <canvas ref={ref} width={40} height={80} style={{position:"absolute",inset:0,width:"100%",height:"100%",mixBlendMode:"multiply",borderRadius:4}}/>;
}

function PainMapSection({ patientName, gender }: { patientName: string; gender?: "M"|"F" }) {
  const [pmView, setPmView] = useState<PMView>("front");
  const [pmTool, setPmTool] = useState<"paint"|"erase"|"arrow">("paint");
  const [pmPainType, setPmPainType] = useState("burning");
  const [pmIntensity, setPmIntensity] = useState(2);
  const [pmBrush, setPmBrush] = useState(2);
  const [pmZones, setPmZones] = useState<PMZones>({ front:{}, back:{}, left:{}, right:{} });
  const [pmArrows, setPmArrows] = useState<PMArrow[]>([]);
  const [pmArrowStart, setPmArrowStart] = useState<{x:number;y:number}|null>(null);
  const [pmShowLabels, setPmShowLabels] = useState(false);
  const [pmVas, setPmVas] = useState(5);
  const [pmNotes, setPmNotes] = useState("");
  const [pmGender, setPmGender] = useState<"M"|"F">(gender ?? "M");
  const [pmActiveTab, setPmActiveTab] = useState<"map"|"summary">("map");
  // Undo/Redo
  const pmHist = useRef<string[]>([JSON.stringify({z:{front:{},back:{},left:{},right:{}},a:[]})]);
  const pmHidx = useRef(0);
  const [pmCanUndo, setPmCanUndo] = useState(false);
  const [pmCanRedo, setPmCanRedo] = useState(false);
  const isPainting = useRef(false);

  const CW = 200, CH = 500;

  const pmBodyComponents: Record<PMView, React.ReactNode> = {
    front: pmGender === "F" ? <BodyFrontF/> : <BodyFrontM/>,
    back:  <BodyBackM/>,
    left:  <BodySideComp flip={false} female={pmGender==="F"}/>,
    right: <BodySideComp flip={true} female={pmGender==="F"}/>,
  };

  const pushHistory = useCallback((z: PMZones, a: PMArrow[]) => {
    const snap = JSON.stringify({z,a});
    const h = pmHist.current.slice(0, pmHidx.current+1);
    h.push(snap);
    if (h.length > 50) h.shift();
    pmHist.current = h;
    pmHidx.current = h.length-1;
    setPmCanUndo(pmHidx.current > 0);
    setPmCanRedo(false);
  }, []);

  const doUndo = () => {
    if (pmHidx.current <= 0) return;
    pmHidx.current--;
    const s = JSON.parse(pmHist.current[pmHidx.current]);
    setPmZones(s.z); setPmArrows(s.a);
    setPmCanUndo(pmHidx.current > 0);
    setPmCanRedo(true);
  };
  const doRedo = () => {
    if (pmHidx.current >= pmHist.current.length-1) return;
    pmHidx.current++;
    const s = JSON.parse(pmHist.current[pmHidx.current]);
    setPmZones(s.z); setPmArrows(s.a);
    setPmCanUndo(true);
    setPmCanRedo(pmHidx.current < pmHist.current.length-1);
  };

  const getPos = useCallback((e: React.MouseEvent, el: HTMLDivElement) => {
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }, []);

  const paintAt = useCallback((px: number, py: number) => {
    const gx0 = Math.floor(px * PM_GRID), gy0 = Math.floor(py * PM_ROWS);
    const r = pmBrush;
    setPmZones(prev => {
      const vd = { ...prev[pmView] };
      for (let dx=-r; dx<=r; dx++) for (let dy=-r; dy<=r; dy++) {
        if (dx*dx+dy*dy > r*r) continue;
        const gx=gx0+dx, gy=gy0+dy;
        if (gx<0||gx>=PM_GRID||gy<0||gy>=PM_ROWS) continue;
        if (pmTool==="erase") delete vd[`${gx},${gy}`];
        else vd[`${gx},${gy}`] = { painType: pmPainType, intensity: pmIntensity };
      }
      return { ...prev, [pmView]: vd };
    });
  }, [pmView, pmPainType, pmTool, pmBrush, pmIntensity]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const el = e.currentTarget as HTMLDivElement;
    const {x,y} = getPos(e, el);
    if (pmTool === "arrow") {
      if (!pmArrowStart) {
        setPmArrowStart({x,y});
      } else {
        const lbl = prompt("Etichetta irradiazione (es. sciatalgia L5):", "") ?? "";
        const newArrow: PMArrow = { id: Date.now(), view: pmView, x1: pmArrowStart.x, y1: pmArrowStart.y, x2: x, y2: y, label: lbl };
        setPmArrows(prev => { const next = [...prev, newArrow]; pushHistory(pmZones, next); return next; });
        setPmArrowStart(null);
      }
      return;
    }
    isPainting.current = true;
    paintAt(x, y);
  }, [pmTool, pmArrowStart, pmView, pmZones, paintAt, pushHistory, getPos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPainting.current || pmTool==="arrow") return;
    const {x,y} = getPos(e, e.currentTarget as HTMLDivElement);
    paintAt(x,y);
  }, [pmTool, paintAt, getPos]);

  const handleMouseUp = useCallback(() => {
    if (isPainting.current) {
      isPainting.current = false;
      setPmZones(prev => { pushHistory(prev, pmArrows); return prev; });
    }
  }, [pmArrows, pushHistory]);

  const handleMouseLeave = useCallback(() => {
    if (isPainting.current) {
      isPainting.current = false;
      setPmZones(prev => { pushHistory(prev, pmArrows); return prev; });
    }
  }, [pmArrows, pushHistory]);

  const totalCells = Object.values(pmZones).reduce((s,v)=>s+Object.keys(v).length,0);
  const summaryByType = PAIN_TYPES_PM.map(pt => ({
    ...pt, cells: Object.values(pmZones).reduce((s,v)=>s+Object.values(v).filter((z:any)=>z.painType===pt.id).length,0)
  })).filter(p=>p.cells>0);

  const vasColor = pmVas<=3?"#16a34a":pmVas<=6?"#f97316":"#dc2626";
  const vasLabel = pmVas===0?"Assente":pmVas<=3?"Lieve":pmVas<=6?"Moderato":pmVas<=8?"Severo":"Insopportabile";

  const exportPDF = () => {
    const by = summaryByType;
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Body Chart – ${patientName}</title>
    <style>body{font-family:system-ui,sans-serif;padding:40px;color:#0f172a;max-width:800px;margin:0 auto}
    h1{font-size:22px;font-weight:800;margin-bottom:4px}.sub{color:#64748b;font-size:13px;margin-bottom:24px}
    .g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}
    .card{background:#f8fafc;border-radius:10px;padding:14px;border:1px solid #e2e8f0}
    .lbl{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
    .val{font-size:20px;font-weight:800}.bar{height:7px;background:#e2e8f0;border-radius:4px;overflow:hidden;margin-top:6px}
    .bf{height:100%;border-radius:4px}table{width:100%;border-collapse:collapse;font-size:13px}
    td,th{padding:8px 12px;border-bottom:1px solid #e2e8f0}th{background:#f1f5f9;font-size:11px;font-weight:700;text-transform:uppercase}
    @media print{button{display:none!important}}</style></head><body>
    <h1>Body Chart – Mappa del Dolore</h1>
    <div class="sub">Paziente: <strong>${patientName}</strong> &nbsp;·&nbsp; Data: ${new Date().toLocaleDateString("it-IT",{day:"2-digit",month:"long",year:"numeric"})} &nbsp;·&nbsp; FisioHub</div>
    <div class="g3">
      <div class="card"><div class="lbl">VAS</div><div class="val" style="color:${vasColor}">${pmVas}/10</div>
        <div style="font-size:12px;color:${vasColor};font-weight:700">${vasLabel}</div>
        <div class="bar"><div class="bf" style="width:${pmVas*10}%;background:${vasColor}"></div></div></div>
      <div class="card"><div class="lbl">Paziente</div><div class="val">${pmGender==="M"?"♂ Uomo":"♀ Donna"}</div></div>
      <div class="card"><div class="lbl">Zone segnate</div><div class="val" style="color:#2563eb">${totalCells}</div></div>
    </div>
    ${by.length>0?`<div style="margin-bottom:20px"><div style="font-size:13px;font-weight:700;margin-bottom:10px">Distribuzione per tipo di dolore</div>
    ${by.map(p=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">
      <div style="width:13px;height:13px;border-radius:3px;background:${p.color};flex-shrink:0"></div>
      <span style="font-size:12px;font-weight:600;width:100px">${p.emoji} ${p.label}</span>
      <div class="bar" style="flex:1"><div class="bf" style="width:${totalCells?Math.round(p.cells/totalCells*100):0}%;background:${p.color}"></div></div>
      <span style="font-size:11px;color:#64748b;width:32px;text-align:right">${totalCells?Math.round(p.cells/totalCells*100):0}%</span></div>`).join("")}</div>`:""}
    ${pmArrows.length>0?`<div style="margin-bottom:20px"><div style="font-size:13px;font-weight:700;margin-bottom:8px">Irradiazioni</div>
    <table><thead><tr><th>Vista</th><th>Descrizione</th></tr></thead><tbody>
    ${pmArrows.map(a=>`<tr><td>${PM_VIEW_LABELS[a.view]}</td><td>${a.label||"—"}</td></tr>`).join("")}</tbody></table></div>`:""}
    ${pmNotes?`<div><div style="font-size:13px;font-weight:700;margin-bottom:6px">Note cliniche</div>
    <div style="font-size:13px;color:#334155;line-height:1.7;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">${pmNotes}</div></div>`:""}
    <div style="margin-top:24px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between">
      <span>FisioHub · Body Chart Pro</span><span>Generato: ${new Date().toLocaleString("it-IT")}</span></div>
    <button onclick="window.print()" style="margin-top:20px;padding:10px 28px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">🖨 Stampa referto</button>
    </body></html>`;
    const w = window.open("","_blank","width=900,height=700");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const btnSm = (label: string, active: boolean, onClick: ()=>void, color="#2563eb") => (
    <button onClick={onClick} style={{ padding:"5px 12px", borderRadius:7, border:`1.5px solid ${active?color:"#e2e8f0"}`,
      background:active?color:"#fff", color:active?"#fff":"#475569", fontWeight:700, fontSize:11, cursor:"pointer" }}>
      {label}
    </button>
  );

  return (
    <section style={{ background:"#fff", borderRadius:14, padding:28, marginBottom:20, border:"1px solid #e2e8f0", boxShadow:"0 1px 4px rgba(15,23,42,0.05), 0 4px 20px rgba(15,23,42,0.04)" }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:18 }}>
        <div>
          <h2 style={{ margin:0, fontWeight:800, fontSize:17, color:"#1e1b4b" }}>🗺 Body Chart – Mappa del Dolore</h2>
          <p style={{ margin:"4px 0 0", fontSize:12, color:"#64748b", fontWeight:600 }}>Dipingi le zone dolorose · usa il pennello · aggiungi frecce di irradiazione</p>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <button onClick={doUndo} disabled={!pmCanUndo} style={{ padding:"5px 11px", borderRadius:7, border:"1px solid #e2e8f0", background:"#fff", color: pmCanUndo?"#0f172a":"#cbd5e1", fontWeight:700, fontSize:11, cursor: pmCanUndo?"pointer":"default" }}>↩</button>
          <button onClick={doRedo} disabled={!pmCanRedo} style={{ padding:"5px 11px", borderRadius:7, border:"1px solid #e2e8f0", background:"#fff", color: pmCanRedo?"#0f172a":"#cbd5e1", fontWeight:700, fontSize:11, cursor: pmCanRedo?"pointer":"default" }}>↪</button>
          <button onClick={() => { if(confirm("Cancellare tutta la mappa?")) { setPmZones({front:{},back:{},left:{},right:{}}); setPmArrows([]); pushHistory({front:{},back:{},left:{},right:{}},[]);} }} style={{ padding:"5px 12px", borderRadius:7, border:"1px solid #fecaca", background:"#fff5f5", color:"#dc2626", fontWeight:700, fontSize:11, cursor:"pointer" }}>Pulisci</button>
          <button onClick={exportPDF} style={{ padding:"7px 16px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#7c3aed,#2563eb)", color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }}>📄 Referto PDF</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid #e2e8f0", marginBottom:16 }}>
        {([["map","🖌 Mappa"],["summary","📊 Riepilogo"]] as const).map(([k,l])=>(
          <button key={k} onClick={()=>setPmActiveTab(k)} style={{ padding:"8px 18px", border:"none", background:"transparent", fontWeight:700, fontSize:12, color:pmActiveTab===k?"#7c3aed":"#94a3b8", borderBottom:pmActiveTab===k?"2px solid #7c3aed":"2px solid transparent", cursor:"pointer", marginBottom:-1 }}>{l}</button>
        ))}
      </div>

      {pmActiveTab === "map" ? (
        <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:20, alignItems:"start" }}>

          {/* Colonna sinistra: toolbar + corpo */}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {/* Vista + genere */}
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
              <div style={{ display:"flex", border:"1px solid #e2e8f0", borderRadius:8, overflow:"hidden" }}>
                {PM_VIEWS.map(v=>(
                  <button key={v} onClick={()=>setPmView(v)} style={{ padding:"5px 12px", border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:pmView===v?"#7c3aed":"#fff", color:pmView===v?"#fff":"#64748b" }}>{PM_VIEW_LABELS[v]}</button>
                ))}
              </div>
              <div style={{ display:"flex", border:"1px solid #e2e8f0", borderRadius:8, overflow:"hidden" }}>
                {(["M","F"] as const).map(g=>(
                  <button key={g} onClick={()=>setPmGender(g)} style={{ padding:"5px 12px", border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:pmGender===g?"#a855f7":"#fff", color:pmGender===g?"#fff":"#64748b" }}>{g==="M"?"♂ Uomo":"♀ Donna"}</button>
                ))}
              </div>
            </div>

            {/* Tool + brush + etichette */}
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
              {btnSm("🖌 Pennello", pmTool==="paint", ()=>{setPmTool("paint");setPmArrowStart(null);},"#7c3aed")}
              {btnSm("⬜ Gomma", pmTool==="erase", ()=>{setPmTool("erase");setPmArrowStart(null);},"#64748b")}
              {btnSm("→ Irradiazione", pmTool==="arrow", ()=>setPmTool("arrow"),"#1e40af")}
              <div style={{ display:"flex", gap:3, alignItems:"center", marginLeft:4 }}>
                {[1,2,3,4].map(s=>(
                  <button key={s} onClick={()=>setPmBrush(s)} style={{ width:s*7+10, height:s*7+10, borderRadius:"50%", border:`2px solid ${pmBrush===s?"#7c3aed":"#e2e8f0"}`, background:pmBrush===s?"#7c3aed":"#f8fafc", cursor:"pointer" }}/>
                ))}
              </div>
              <button onClick={()=>setPmShowLabels(p=>!p)} style={{ padding:"5px 10px", borderRadius:7, border:`1.5px solid ${pmShowLabels?"#7c3aed":"#e2e8f0"}`, background:pmShowLabels?"rgba(124,58,237,0.08)":"#fff", color:pmShowLabels?"#7c3aed":"#64748b", fontWeight:700, fontSize:11, cursor:"pointer" }}>🏷 Etichette</button>
            </div>

            {/* Tipo dolore */}
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              {PAIN_TYPES_PM.map(pt=>(
                <button key={pt.id} onClick={()=>setPmPainType(pt.id)} style={{ padding:"4px 10px", borderRadius:99, border:`2px solid ${pmPainType===pt.id?pt.color:"#e2e8f0"}`, background:pmPainType===pt.id?pt.color+"18":"#fff", color:pmPainType===pt.id?pt.color:"#64748b", fontWeight:700, fontSize:11, cursor:"pointer", transform:pmPainType===pt.id?"scale(1.06)":"scale(1)" }}>
                  {pt.emoji} {pt.label}
                </button>
              ))}
            </div>

            {/* Intensità */}
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <span style={{ fontSize:11, color:"#64748b", fontWeight:700 }}>Intensità:</span>
              {([["Lieve","#16a34a",1],["Moderato","#f97316",2],["Severo","#dc2626",3]] as [string,string,number][]).map(([l,c,v])=>(
                <button key={v} onClick={()=>setPmIntensity(v)} style={{ padding:"4px 12px", borderRadius:99, border:`2px solid ${pmIntensity===v?c:"#e2e8f0"}`, background:pmIntensity===v?c+"18":"#fff", color:c, fontWeight:700, fontSize:11, cursor:"pointer" }}>{l}</button>
              ))}
            </div>

            {/* Corpo interattivo */}
            {pmTool==="arrow" && (
              <div style={{ fontSize:11, color:"#c2410c", fontWeight:700, padding:"6px 10px", background:"#fff7ed", borderRadius:7, border:"1px solid #fed7aa" }}>
                {pmArrowStart ? "→ Clicca il punto di arrivo" : "→ Clicca il punto di partenza dell'irradiazione"}
              </div>
            )}
            <div style={{ position:"relative", width:CW, height:CH, cursor:pmTool==="erase"?"cell":"crosshair" }}>
              <div style={{ position:"absolute", inset:0, zIndex:1, pointerEvents:"none" }}>
                {pmBodyComponents[pmView]}
              </div>
              <PainMapCanvasSection
                canvasW={CW} canvasH={CH}
                zones={pmZones} view={pmView}
                arrowStart={pmArrowStart} arrows={pmArrows}
                showLabels={pmShowLabels}
                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave}
              />
            </div>
          </div>

          {/* Pannello destra */}
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

            {/* Preview 4 viste */}
            <div style={{ background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 14px" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#0f172a", marginBottom:8 }}>Vista globale</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                {PM_VIEWS.map(v=>(
                  <button key={v} onClick={()=>setPmView(v)} style={{ background:pmView===v?"rgba(124,58,237,0.07)":"#fff", border:`1.5px solid ${pmView===v?"#7c3aed":"#e2e8f0"}`, borderRadius:8, padding:"6px 4px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                    <div style={{ width:40, height:80, position:"relative" }}>
                      <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>{pmBodyComponents[v]}</div>
                      <PMiniCanvas zones={pmZones[v]} view={v}/>
                    </div>
                    <span style={{ fontSize:9, fontWeight:700, color:pmView===v?"#7c3aed":"#64748b" }}>{PM_VIEW_LABELS[v]}</span>
                    <span style={{ fontSize:9, color:"#94a3b8" }}>{Object.keys(pmZones[v]).length}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* VAS */}
            <div style={{ background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 14px" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#0f172a", marginBottom:6 }}>VAS – Scala del dolore</div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:10, color:"#94a3b8" }}>0</span>
                <div style={{ textAlign:"center" }}>
                  <span style={{ fontSize:24, fontWeight:900, color:vasColor }}>{pmVas}</span>
                  <div style={{ fontSize:10, fontWeight:700, color:vasColor }}>{vasLabel}</div>
                </div>
                <span style={{ fontSize:10, color:"#94a3b8" }}>10</span>
              </div>
              <input type="range" min="0" max="10" step="1" value={pmVas} onChange={e=>setPmVas(+e.target.value)} style={{ width:"100%", accentColor:vasColor }}/>
            </div>

            {/* Irradiazioni */}
            {pmArrows.length > 0 && (
              <div style={{ background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 14px" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#0f172a", marginBottom:8 }}>Irradiazioni ({pmArrows.length})</div>
                {pmArrows.map((a,i)=>(
                  <div key={a.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"4px 8px", background:"#fff", borderRadius:6, border:"1px solid #e2e8f0", marginBottom:4 }}>
                    <span style={{ fontSize:11, color:"#334155" }}>{a.label||`Irradiazione ${i+1}`} <span style={{ color:"#94a3b8" }}>({PM_VIEW_LABELS[a.view]})</span></span>
                    <button onClick={()=>setPmArrows(prev=>{const n=prev.filter(x=>x.id!==a.id);pushHistory(pmZones,n);return n;})} style={{ border:"none", background:"none", cursor:"pointer", color:"#dc2626", fontSize:14, padding:"0 2px" }}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Legenda */}
            <div style={{ background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 14px" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#0f172a", marginBottom:8 }}>Legenda</div>
              {PAIN_TYPES_PM.map(pt=>(
                <div key={pt.id} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5 }}>
                  <div style={{ width:12, height:12, borderRadius:3, background:pt.color+"99", border:`2px solid ${pt.color}`, flexShrink:0 }}/>
                  <span style={{ fontSize:11, fontWeight:600, color:"#334155" }}>{pt.emoji} {pt.label}</span>
                </div>
              ))}
            </div>

            {/* Note */}
            <div style={{ background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 14px" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#0f172a", marginBottom:6 }}>Note cliniche</div>
              <textarea value={pmNotes} onChange={e=>setPmNotes(e.target.value)} placeholder="Tipo di dolore, quando compare, irradiazione, aggravanti/allevianti, durata..." rows={4}
                style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 10px", fontSize:12, resize:"vertical", outline:"none", color:"#0f172a", boxSizing:"border-box", fontFamily:"inherit", background:"#fff" }}/>
            </div>
          </div>
        </div>
      ) : (
        /* Summary */
        <div style={{ maxWidth:680 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
            {[{l:"VAS",v:`${pmVas}/10`,c:vasColor},{l:"Tipo dominante",v:summaryByType[0]?`${summaryByType[0].emoji} ${summaryByType[0].label}`:"—",c:"#0f172a"},{l:"Zone affette",v:`${totalCells}`,c:"#7c3aed"}].map(k=>(
              <div key={k.l} style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px", border:"1px solid #e2e8f0" }}>
                <div style={{ fontSize:10, color:"#94a3b8", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>{k.l}</div>
                <div style={{ fontSize:18, fontWeight:800, color:k.c }}>{k.v}</div>
              </div>
            ))}
          </div>
          {summaryByType.length > 0 && (
            <div style={{ background:"#f8fafc", borderRadius:10, padding:"14px", border:"1px solid #e2e8f0", marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#0f172a", marginBottom:10 }}>Distribuzione per tipo</div>
              {summaryByType.map(pt=>(
                <div key={pt.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                  <span style={{ fontSize:13 }}>{pt.emoji}</span>
                  <span style={{ fontSize:11, fontWeight:600, color:"#334155", width:88 }}>{pt.label}</span>
                  <div style={{ flex:1, height:7, background:"#e2e8f0", borderRadius:4, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${Math.round(pt.cells/totalCells*100)}%`, background:pt.color, borderRadius:4 }}/>
                  </div>
                  <span style={{ fontSize:10, color:"#94a3b8", fontWeight:700, width:36, textAlign:"right" }}>{Math.round(pt.cells/totalCells*100)}%</span>
                </div>
              ))}
            </div>
          )}
          {pmNotes && (
            <div style={{ background:"#f8fafc", borderRadius:10, padding:"14px", border:"1px solid #e2e8f0" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>Note cliniche</div>
              <div style={{ fontSize:13, color:"#334155", lineHeight:1.6 }}>{pmNotes}</div>
            </div>
          )}
          {totalCells===0 && !pmNotes && (
            <div style={{ textAlign:"center", padding:"40px 0", color:"#94a3b8", fontSize:13 }}>Nessuna zona segnata.</div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Fine Pain Map ─────────────────────────────────────────────────────────────


type Plan   = "invoice" | "no_invoice";
type Status = "booked" | "confirmed" | "done";

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  birth_date: string | null;
  birth_place: string | null;
  tax_code: string | null;
  residence_city: string | null;
  preferred_plan: Plan | null;
  anamnesis: string | null;
  diagnosis: string | null;
  treatment: string | null;
  patient_status: string | null;
  acquisition_channel: string | null;
  first_visit_date: string | null;
  main_complaint: string | null;
  body_region: string | null;
  side: string | null;
  pathology_type: string | null;
  medical_diagnosis: string | null;
  expected_frequency: number | null;
  package_size: number | null;
};

type AppointmentRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: Status;
  is_paid: boolean;
  calendar_note: string | null;
};

type DocType = "gdpr_informativa_privacy" | "consenso_trattamento" | "altro";
type PatientDoc = {
  id: string;
  patient_id: string;
  doc_type: DocType;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
};

type ClinicalDocType = "prescrizione" | "rx" | "rm" | "tac" | "elettromiografia" | "ecografia";
type ClinicalDocument = {
  id: string;
  patient_id: string;
  doc_type: ClinicalDocType;
  report_text: string | null;
  file_name: string | null;
  storage_path: string | null;
  uploaded_at: string;
};

// ─── Theme (identico al calendario) ──────────────────────────────────────────
const THEME = {
  appBg:          "#f1f5f9",
  panelBg:        "#ffffff",
  panelSoft:      "#f7f9fd",
  cardBg:         "#ffffff",
  text:           "#0f172a",
  textSoft:       "#1e293b",
  muted:          "#334155",
  border:         "#cbd5e1",
  borderSoft:     "#94a3b8",
  blue:           "#2563eb",
  blueDark:       "#1e40af",
  green:          "#16a34a",
  greenDark:      "#15803d",
  teal:           "#0d9488",
  red:            "#dc2626",
  amber:          "#f97316",
  gray:           "#94a3b8",
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function normalizeTaxCode(v: string) {
  return v.replace(/\s+/g, "").toUpperCase();
}

function ddmmyyyy(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function capitalizeFirst(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatDateTimeIT(iso: string) {
  const d = new Date(iso);
  const weekday = capitalizeFirst(d.toLocaleString("it-IT", { weekday: "short" }));
  const datePart = d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timePart = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${weekday} ${datePart} • ${timePart}`;
}

function statusLabel(s: Status) {
  if (s === "booked")    return "Prenotata";
  if (s === "confirmed") return "Confermata";
  return "Eseguita";
}

function statusColors(s: Status) {
  if (s === "done")      return { fg: THEME.green, bg: "rgba(22,163,74,0.10)",   bd: "rgba(22,163,74,0.30)" };
  if (s === "confirmed") return { fg: THEME.blue,  bg: "rgba(37,99,235,0.10)",   bd: "rgba(37,99,235,0.30)" };
  return                        { fg: THEME.red,   bg: "rgba(220,38,38,0.10)",   bd: "rgba(220,38,38,0.30)" };
}

function docTypeLabel(t: DocType) {
  if (t === "gdpr_informativa_privacy") return "GDPR – Informativa Privacy";
  if (t === "consenso_trattamento")     return "Consenso al trattamento";
  return "Altro";
}

function clinicalDocTypeLabel(t: ClinicalDocType) {
  const labels: Record<ClinicalDocType, string> = {
    prescrizione:   "Prescrizione",
    rx:             "Rx (Radiografia)",
    rm:             "RM (Risonanza Magnetica)",
    tac:            "TAC (Tomografia Assiale Computerizzata)",
    elettromiografia: "Elettromiografia",
    ecografia:      "Ecografia",
  };
  return labels[t];
}

function same(v1: any, v2: any) {
  return (v1 ?? "") === (v2 ?? "");
}

function safeNumToStr(n: number | null | undefined) {
  return typeof n === "number" && !Number.isNaN(n) ? String(n) : "";
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolvedParams = React.use(params as any) as { id: string };
  const patientId = resolvedParams.id;

  // ── Auth / user menu ──────────────────────────────────────────────────────
  const [userEmail, setUserEmail]     = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data?.user?.email ?? null);
    })();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!userMenuOpen) return;
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);

  const handleLogout = useCallback(async () => {
    try { await supabase.auth.signOut(); } finally {
      setUserMenuOpen(false);
      window.location.href = "/login";
    }
  }, []);

  const userInitials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "?";

  // ── Core state ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);

  // ── Anagrafica form ───────────────────────────────────────────────────────
  const [demoEditMode,    setDemoEditMode]    = useState(false);
  const [savingDemo,      setSavingDemo]      = useState(false);
  const [deletingPatient, setDeletingPatient] = useState(false);

  const [firstName,   setFirstName]   = useState("");
  const [lastName,    setLastName]    = useState("");
  const [phone,       setPhone]       = useState("");
  const [resCity,     setResCity]     = useState("");
  const [preferredPlan, setPreferredPlan] = useState<Plan>("invoice");
  const [birthDate,   setBirthDate]   = useState("");
  const [birthPlace,  setBirthPlace]  = useState("");
  const [taxCode,     setTaxCode]     = useState("");

  // V2 fields
  const [showV2Clinical,    setShowV2Clinical]    = useState(true);
  const [showV2Business,    setShowV2Business]    = useState(true);

  // Sezioni collassabili — tutte chiuse di default tranne anagrafica
  const [secClinica,      setSecClinica]      = useState(false);
  const [secBodyChart,    setSecBodyChart]    = useState(false);
  const [secDocClinici,   setSecDocClinici]   = useState(false);
  const [secTerapie,      setSecTerapie]      = useState(false);
  const [secGDPR,         setSecGDPR]         = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentSaved,  setConsentSaved]  = useState(false);
  const [consentError,  setConsentError]  = useState("");
  const sigPrivacyRef  = useRef<HTMLCanvasElement>(null);
  const sigConsensoRef = useRef<HTMLCanvasElement>(null);
  const [patientStatus,     setPatientStatus]     = useState("active");
  const [acquisitionChannel, setAcquisitionChannel] = useState("");
  const [firstVisitDate,    setFirstVisitDate]    = useState("");
  const [mainComplaint,     setMainComplaint]     = useState("");
  const [bodyRegion,        setBodyRegion]        = useState("");
  const [side,              setSide]              = useState("");
  const [pathologyType,     setPathologyType]     = useState("");
  const [medicalDiagnosis,  setMedicalDiagnosis]  = useState("");
  const [expectedFrequency, setExpectedFrequency] = useState("");
  const [packageSize,       setPackageSize]       = useState("");

  // ── Clinica ───────────────────────────────────────────────────────────────
  const [anamnesis,       setAnamnesis]       = useState("");
  const [diagnosis,       setDiagnosis]       = useState("");
  const [treatment,       setTreatment]       = useState("");
  const [savingClinical,  setSavingClinical]  = useState(false);
  const [showTreatmentDiary, setShowTreatmentDiary] = useState(true);

  // ── Documenti clinici ─────────────────────────────────────────────────────
  const [clinicalDocs,       setClinicalDocs]       = useState<ClinicalDocument[]>([]);
  const [loadingClinicalDocs, setLoadingClinicalDocs] = useState(false);
  const [savingClinicalDoc,  setSavingClinicalDoc]  = useState<string | null>(null);
  const [clinicalUploadType, setClinicalUploadType] = useState<ClinicalDocType>("prescrizione");
  const [clinicalUploadTitle, setClinicalUploadTitle] = useState("");
  const [clinicalUploadFile, setClinicalUploadFile] = useState<File | null>(null);

  // ── Appuntamenti ──────────────────────────────────────────────────────────
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [rowBusy,      setRowBusy]      = useState<Record<string, boolean>>({});
  const [notesByApptId,    setNotesByApptId]    = useState<Record<string, string>>({});
  const [noteBusyByApptId, setNoteBusyByApptId] = useState<Record<string, boolean>>({});

  // ── Documenti GDPR ────────────────────────────────────────────────────────
  const [docs,        setDocs]        = useState<PatientDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [docType,     setDocType]     = useState<DocType>("gdpr_informativa_privacy");
  const [file,        setFile]        = useState<File | null>(null);

  // ─── Hydrate from patient ─────────────────────────────────────────────────
  function hydrateFromPatient(p: Patient) {
    setFirstName(p.first_name ?? "");
    setLastName(p.last_name ?? "");
    setPhone(p.phone ?? "");
    setResCity(p.residence_city ?? "");
    setPreferredPlan((p.preferred_plan ?? "invoice") as Plan);
    setBirthDate(p.birth_date ?? "");
    setBirthPlace(p.birth_place ?? "");
    setTaxCode(p.tax_code ?? "");
    setAnamnesis(p.anamnesis ?? "");
    setDiagnosis(p.diagnosis ?? "");
    setTreatment(p.treatment ?? "");
    setPatientStatus((p.patient_status ?? "active") as any);
    setAcquisitionChannel(p.acquisition_channel ?? "");
    setFirstVisitDate(p.first_visit_date ?? "");
    setMainComplaint(p.main_complaint ?? "");
    setBodyRegion(p.body_region ?? "");
    setSide(p.side ?? "");
    setPathologyType(p.pathology_type ?? "");
    setMedicalDiagnosis(p.medical_diagnosis ?? "");
    setExpectedFrequency(safeNumToStr(p.expected_frequency));
    setPackageSize(safeNumToStr(p.package_size));
  }

  // ─── Dirty checks ─────────────────────────────────────────────────────────
  const demoDirty = useMemo(() => {
    if (!patient) return false;
    return (
      !same(firstName.trim(),  patient.first_name)  ||
      !same(lastName.trim(),   patient.last_name)   ||
      !same(phone.trim(),      patient.phone)        ||
      !same(resCity.trim(),    patient.residence_city) ||
      preferredPlan !== (patient.preferred_plan ?? "invoice") ||
      !same(birthDate.trim(),  patient.birth_date)  ||
      !same(birthPlace.trim(), patient.birth_place) ||
      !same(normalizeTaxCode(taxCode).trim(), patient.tax_code) ||
      !same((patientStatus ?? "").trim(),      (patient.patient_status ?? "active")) ||
      !same((acquisitionChannel ?? "").trim(), (patient.acquisition_channel ?? "")) ||
      !same((firstVisitDate ?? "").trim(),     (patient.first_visit_date ?? "")) ||
      !same((mainComplaint ?? "").trim(),      (patient.main_complaint ?? "")) ||
      !same((bodyRegion ?? "").trim(),         (patient.body_region ?? "")) ||
      !same((side ?? "").trim(),               (patient.side ?? "")) ||
      !same((pathologyType ?? "").trim(),      (patient.pathology_type ?? "")) ||
      !same((medicalDiagnosis ?? "").trim(),   (patient.medical_diagnosis ?? "")) ||
      !same((expectedFrequency ?? "").trim(),  safeNumToStr(patient.expected_frequency)) ||
      !same((packageSize ?? "").trim(),        safeNumToStr(patient.package_size))
    );
  }, [patient, firstName, lastName, phone, resCity, preferredPlan, birthDate, birthPlace, taxCode,
      patientStatus, acquisitionChannel, firstVisitDate, mainComplaint, bodyRegion, side,
      pathologyType, medicalDiagnosis, expectedFrequency, packageSize]);

  const clinicalDirty = useMemo(() => {
    if (!patient) return false;
    return (
      !same(anamnesis.trim(), patient.anamnesis) ||
      !same(diagnosis.trim(), patient.diagnosis) ||
      !same(treatment.trim(), patient.treatment)
    );
  }, [patient, anamnesis, diagnosis, treatment]);

  // ─── Loaders ──────────────────────────────────────────────────────────────
  async function loadPatient() {
    setLoading(true);
    setError("");
    const res = await supabase
      .from("patients")
      .select("id, first_name, last_name, phone, birth_date, birth_place, tax_code, residence_city, preferred_plan, anamnesis, diagnosis, treatment, patient_status, acquisition_channel, first_visit_date, main_complaint, body_region, side, pathology_type, medical_diagnosis, expected_frequency, package_size")
      .eq("id", patientId)
      .single();
    if (res.error) { setError(res.error.message); setPatient(null); setLoading(false); return; }
    const p = res.data as Patient;
    setPatient(p);
    hydrateFromPatient(p);
    setDemoEditMode(false);
    setLoading(false);
  }

  async function loadClinicalDocs() {
    setLoadingClinicalDocs(true);
    setError("");
    const res = await supabase
      .from("clinical_documents")
      .select("id, patient_id, doc_type, report_text, file_name, storage_path, uploaded_at")
      .eq("patient_id", patientId)
      .order("uploaded_at", { ascending: false });
    if (res.error) { setError(res.error.message); setClinicalDocs([]); }
    else setClinicalDocs((res.data ?? []) as ClinicalDocument[]);
    setLoadingClinicalDocs(false);
  }

  async function loadAppointments() {
    setLoadingAppts(true);
    setError("");
    const res = await supabase
      .from("appointments")
      .select("id, start_at, end_at, status, is_paid, calendar_note")
      .eq("patient_id", patientId)
      .order("start_at", { ascending: false });
    if (res.error) { setError(res.error.message); setAppointments([]); setLoadingAppts(false); return; }
    setAppointments((res.data ?? []) as AppointmentRow[]);
    const map: Record<string, string> = {};
    (res.data ?? []).forEach((r: any) => { map[r.id] = (r.calendar_note ?? "") as string; });
    setNotesByApptId(map);
    setLoadingAppts(false);
  }

  async function loadDocs() {
    setLoadingDocs(true);
    setError("");
    const res = await supabase
      .from("patient_documents")
      .select("id, patient_id, doc_type, file_name, storage_path, uploaded_at")
      .eq("patient_id", patientId)
      .order("uploaded_at", { ascending: false });
    if (res.error) { setError(res.error.message); setDocs([]); }
    else setDocs((res.data ?? []) as PatientDoc[]);
    setLoadingDocs(false);
  }

  useEffect(() => {
    loadPatient();
    loadAppointments();
    loadDocs();
    loadClinicalDocs();
  }, [patientId]);

  // ─── Save / update ────────────────────────────────────────────────────────
  async function saveDemographics() {
    if (!patient) return;
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln) { setError("Nome e cognome non possono essere vuoti."); return; }
    setSavingDemo(true);
    setError("");
    const res = await supabase.from("patients").update({
      first_name:          fn,
      last_name:           ln,
      phone:               phone.trim() || null,
      residence_city:      resCity.trim() || null,
      preferred_plan:      preferredPlan,
      birth_date:          birthDate || null,
      birth_place:         birthPlace.trim() || null,
      tax_code:            normalizeTaxCode(taxCode).trim() || null,
      patient_status:      patientStatus || null,
      acquisition_channel: acquisitionChannel || null,
      first_visit_date:    firstVisitDate || null,
      main_complaint:      mainComplaint.trim() || null,
      body_region:         bodyRegion || null,
      side:                side || null,
      pathology_type:      pathologyType || null,
      medical_diagnosis:   medicalDiagnosis.trim() || null,
      expected_frequency:  expectedFrequency.trim() ? Number(expectedFrequency) : null,
      package_size:        packageSize.trim() ? Number(packageSize) : null,
    }).eq("id", patientId);
    setSavingDemo(false);
    if (res.error) {
      const msg = res.error.message || "Errore";
      setError(msg.toLowerCase().includes("column") && msg.toLowerCase().includes("does not exist")
        ? msg + " → Manca la migration SQL dei campi V2."
        : msg);
      return;
    }
    await loadPatient();
  }

  function resetDemographics() {
    if (!patient) return;
    setFirstName(patient.first_name ?? "");
    setLastName(patient.last_name ?? "");
    setPhone(patient.phone ?? "");
    setResCity(patient.residence_city ?? "");
    setPreferredPlan((patient.preferred_plan ?? "invoice") as Plan);
    setBirthDate(patient.birth_date ?? "");
    setBirthPlace(patient.birth_place ?? "");
    setTaxCode(patient.tax_code ?? "");
    setPatientStatus((patient.patient_status ?? "active") as any);
    setAcquisitionChannel(patient.acquisition_channel ?? "");
    setFirstVisitDate(patient.first_visit_date ?? "");
    setMainComplaint(patient.main_complaint ?? "");
    setBodyRegion(patient.body_region ?? "");
    setSide(patient.side ?? "");
    setPathologyType(patient.pathology_type ?? "");
    setMedicalDiagnosis(patient.medical_diagnosis ?? "");
    setExpectedFrequency(safeNumToStr(patient.expected_frequency));
    setPackageSize(safeNumToStr(patient.package_size));
  }

  async function saveClinical() {
    if (!patient) return;
    setSavingClinical(true);
    setError("");
    const res = await supabase.from("patients").update({
      anamnesis:  anamnesis.trim() || null,
      diagnosis:  diagnosis.trim() || null,
      treatment:  treatment.trim() || null,
    }).eq("id", patientId);
    setSavingClinical(false);
    if (res.error) { setError(res.error.message); return; }
    await loadPatient();
  }

  function resetClinical() {
    if (!patient) return;
    setAnamnesis(patient.anamnesis ?? "");
    setDiagnosis(patient.diagnosis ?? "");
    setTreatment(patient.treatment ?? "");
  }

  async function uploadClinicalDocument() {
    if (!clinicalUploadFile) { setError("Seleziona un file (immagine o PDF)."); return; }
    setSavingClinicalDoc("upload");
    setError("");
    const f = clinicalUploadFile;
    const safeOriginal = f.name.replace(/[^\w.\-() ]+/g, "_");
    const path = `clinical_docs/${patientId}/${Date.now()}_${safeOriginal}`;
    const uploadRes = await supabase.storage.from("patient_docs").upload(path, f, { upsert: false });
    if (uploadRes.error) { setError(`Upload fallito: ${uploadRes.error.message}`); setSavingClinicalDoc(null); return; }
    const displayName = clinicalUploadTitle.trim() || f.name;
    const ins = await supabase.from("clinical_documents").insert({
      patient_id:  patientId,
      doc_type:    clinicalUploadType,
      report_text: null,
      file_name:   displayName,
      storage_path: path,
      uploaded_at: new Date().toISOString(),
    });
    if (ins.error) { setError(`Errore DB: ${ins.error.message}`); setSavingClinicalDoc(null); return; }
    setClinicalUploadTitle("");
    setClinicalUploadFile(null);
    await loadClinicalDocs();
    setSavingClinicalDoc(null);
  }

  async function openClinicalDocument(doc: ClinicalDocument) {
    if (!doc.storage_path) { setError("Nessun file associato."); return; }
    setError("");
    const res = await supabase.storage.from("patient_docs").createSignedUrl(doc.storage_path, 60);
    if (res.error || !res.data?.signedUrl) { setError(`Impossibile aprire: ${res.error?.message ?? "signed url missing"}`); return; }
    window.open(res.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteClinicalDocument(doc: ClinicalDocument) {
    if (!window.confirm(`Eliminare il documento "${clinicalDocTypeLabel(doc.doc_type)}"?`)) return;
    setError("");
    const delRow = await supabase.from("clinical_documents").delete().eq("id", doc.id);
    if (delRow.error) { setError(delRow.error.message); return; }
    if (doc.storage_path) {
      const delObj = await supabase.storage.from("patient_docs").remove([doc.storage_path]);
      if (delObj.error) setError(`Record eliminato, ma file non rimosso: ${delObj.error.message}`);
    }
    await loadClinicalDocs();
  }

  async function saveAppointmentNote(apptId: string) {
    setError("");
    setNoteBusyByApptId(m => ({ ...m, [apptId]: true }));
    const note = (notesByApptId[apptId] ?? "").trim();
    const res = await supabase.from("appointments").update({ calendar_note: note || null }).eq("id", apptId);
    setNoteBusyByApptId(m => ({ ...m, [apptId]: false }));
    if (res.error) setError(res.error.message);
  }

  function applyNoteTemplate(apptId: string) {
    const tpl = "🎯 Obiettivo: \n👐 Tecniche/Trattamento: \n🏋️ Esercizi: \n📌 Note / risposta del paziente: \n";
    setNotesByApptId(m => ({ ...m, [apptId]: (m[apptId] ?? "") || tpl }));
  }

  async function updateTherapyStatus(apptId: string, status: Status) {
    setError("");
    setRowBusy(m => ({ ...m, [apptId]: true }));
    const payload: any = { status };
    if (status !== "done") payload.is_paid = false;
    const res = await supabase.from("appointments").update(payload).eq("id", apptId);
    setRowBusy(m => ({ ...m, [apptId]: false }));
    if (res.error) { setError(res.error.message); return; }
    await loadAppointments();
  }

  async function togglePaid(apptId: string, newValue: boolean) {
    setError("");
    setRowBusy(m => ({ ...m, [apptId]: true }));
    const res = await supabase.from("appointments").update({ is_paid: newValue }).eq("id", apptId);
    setRowBusy(m => ({ ...m, [apptId]: false }));
    if (res.error) { setError(res.error.message); return; }
    await loadAppointments();
  }

  async function uploadDocument() {
    if (!file) { setError("Seleziona un file."); return; }
    setError("");
    setUploading(true);
    const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
    const path = `${patientId}/${Date.now()}_${safeName}`;
    const up = await supabase.storage.from("patient_docs").upload(path, file, { upsert: false });
    if (up.error) { setError(`Upload fallito: ${up.error.message}`); setUploading(false); return; }
    const ins = await supabase.from("patient_documents").insert({ patient_id: patientId, doc_type: docType, file_name: file.name, storage_path: path });
    if (ins.error) { setError(`Errore DB: ${ins.error.message}`); setUploading(false); return; }
    setFile(null);
    setUploading(false);
    await loadDocs();
  }

  async function openDocument(doc: PatientDoc) {
    setError("");
    const res = await supabase.storage.from("patient_docs").createSignedUrl(doc.storage_path, 60);
    if (res.error || !res.data?.signedUrl) { setError(`Impossibile aprire: ${res.error?.message ?? "signed url missing"}`); return; }
    const isHtml = doc.file_name?.endsWith(".html") || doc.storage_path?.endsWith(".html");
    if (isHtml) {
      // Fetch content and open as proper HTML blob so the browser renders it
      const resp = await fetch(res.data.signedUrl);
      const html = await resp.text();
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url  = URL.createObjectURL(blob);
      const w    = window.open(url, "_blank", "noopener,noreferrer");
      if (w) setTimeout(() => URL.revokeObjectURL(url), 30000);
    } else {
      window.open(res.data.signedUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function deleteDocument(doc: PatientDoc) {
    if (!window.confirm("Eliminare questo documento? (DB + Storage)")) return;
    setError("");
    const delRow = await supabase.from("patient_documents").delete().eq("id", doc.id);
    if (delRow.error) { setError(delRow.error.message); return; }
    const delObj = await supabase.storage.from("patient_docs").remove([doc.storage_path]);
    if (delObj.error) setError(`Record eliminato, ma file non rimosso: ${delObj.error.message}`);
    await loadDocs();
  }

  async function deletePatient() {
    if (!patient) return;
    if (!window.confirm(`Vuoi ELIMINARE definitivamente il paziente:\n${patient.last_name.toUpperCase()} ${patient.first_name.toUpperCase()} ?\n\nQuesta operazione è irreversibile.`)) return;
    setDeletingPatient(true);
    setError("");
    const res = await supabase.from("patients").delete().eq("id", patientId);
    setDeletingPatient(false);
    if (res.error) { setError(`Impossibile eliminare: ${res.error.message}. Elimina prima le sedute collegate o imposta ON DELETE CASCADE.`); return; }
    window.location.href = "/patients";
  }

  // ─── Derived ──────────────────────────────────────────────────────────────
  const therapiesCount = appointments.length;
  const doneCount      = appointments.filter(a => a.status === "done").length;
  const paidCount      = appointments.filter(a => a.status === "done" && a.is_paid).length;
  const lastTherapy    = appointments[0]?.start_at;

  // ─── Shared style helpers ─────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%", marginTop: 6, padding: "10px 12px",
    borderRadius: 8, border: `1.5px solid ${THEME.border}`,
    background: THEME.panelBg, color: THEME.text,
    outline: "none", fontSize: 13, fontWeight: 600,
    boxSizing: "border-box",
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: "vertical" as const,
  };

  const cardStyle: React.CSSProperties = {
    background: THEME.panelBg, borderRadius: 14,
    padding: 0, marginBottom: 12,
    border: `1px solid ${THEME.border}`,
    boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
    overflow: "hidden",
  };

  const cardBody = { padding: "20px 24px" };

  const sectionHeaderStyle: React.CSSProperties = {
    display: "flex", justifyContent: "space-between",
    alignItems: "flex-start", gap: 12, marginBottom: 20,
  };

  const SecHeader = ({ icon, title, subtitle, open, onToggle, extra, badge }: {
    icon:string; title:string; subtitle:string; open:boolean; onToggle:()=>void; extra?:React.ReactNode; badge?:React.ReactNode;
  }) => (
    <div onClick={onToggle} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 22px", cursor:"pointer", userSelect:"none" as const, borderBottom: open ? `1px solid ${THEME.border}` : "none", background: open ? "#fff" : "#f9fafb", transition:"background .12s" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:34, height:34, borderRadius:9, background:"rgba(15,23,42,0.05)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, flexShrink:0 }}>{icon}</div>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontWeight:800, fontSize:14, color:THEME.text }}>{title}</span>
            {badge}
          </div>
          {!open && subtitle && <div style={{ fontSize:11, color:THEME.muted, fontWeight:600, marginTop:1 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {extra}
        <div style={{ width:22, height:22, borderRadius:6, border:`1px solid ${THEME.border}`, background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:THEME.muted, fontWeight:700, flexShrink:0 }}>{open?"−":"+"}</div>
      </div>
    </div>
  );

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 700,
    color: THEME.muted, marginBottom: 5,
    textTransform: "uppercase", letterSpacing: 0.5,
  };

  const tableHeaderStyle: React.CSSProperties = {
    textAlign: "left", padding: "11px 14px",
    fontSize: 11, color: THEME.muted, fontWeight: 700,
    borderBottom: `1.5px solid ${THEME.border}`,
    background: "rgba(241,245,249,0.9)",
    textTransform: "uppercase", letterSpacing: 0.5,
  };

  function btnPrimary(label: string, onClick: () => void, disabled = false): React.ReactNode {
    return (
      <button onClick={onClick} disabled={disabled} style={{
        padding: "9px 18px", borderRadius: 8, border: "none",
        background: disabled ? THEME.gray : "linear-gradient(135deg, #0d9488, #2563eb)",
        color: "#fff", fontWeight: 700, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1, boxShadow: disabled ? "none" : "0 2px 8px rgba(13,148,136,0.2)",
      }}>{label}</button>
    );
  }

  function btnOutline(label: string, onClick: () => void, color = THEME.blue, disabled = false): React.ReactNode {
    return (
      <button onClick={onClick} disabled={disabled} style={{
        padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${color}`,
        background: THEME.panelBg, color, fontWeight: 700, fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      }}>{label}</button>
    );
  }

  // ─── Loading / error states ───────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: THEME.appBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: THEME.muted, fontWeight: 600, fontSize: 15 }}>Caricamento scheda paziente…</div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div style={{ minHeight: "100vh", background: THEME.appBg, padding: 40 }}>
        <div style={{ color: THEME.red, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Scheda paziente non trovata</div>
        <div style={{ fontSize: 13, color: THEME.muted, marginBottom: 16 }}>ID: <code>{patientId}</code></div>
        {error && <div style={{ ...cardStyle, borderColor: "rgba(220,38,38,0.3)", color: THEME.red, fontSize: 13 }}>{error}</div>}
        <Link href="/patients" style={{ color: THEME.blue, fontWeight: 700, textDecoration: "none" }}>← Torna ai pazienti</Link>
      </div>
    );
  }

  const headerName = `${patient.last_name} ${patient.first_name}`.toUpperCase();

  // ─── Render ───────────────────────────────────────────────────────────────

  // ─── Utilità consensi ────────────────────────────────────────────────────
  function initSigCanvas(ref: React.RefObject<HTMLCanvasElement | null>) {
    const cv = ref.current; if (!cv) return;
    cv.width = cv.offsetWidth || 500;
    const ctx = cv.getContext("2d")!;
    ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    let drawing = false, lx = 0, ly = 0;
    const xy = (e: MouseEvent | TouchEvent): [number, number] => {
      const r = cv.getBoundingClientRect();
      const s = "touches" in e ? e.touches[0] : e as MouseEvent;
      return [s.clientX - r.left, s.clientY - r.top];
    };
    cv.onmousedown  = (e) => { drawing = true; [lx, ly] = xy(e); ctx.beginPath(); ctx.moveTo(lx, ly); };
    cv.onmousemove  = (e) => { if (!drawing) return; const [x, y] = xy(e); ctx.lineTo(x, y); ctx.stroke(); lx = x; ly = y; };
    cv.onmouseup    = () => { drawing = false; };
    cv.onmouseleave = () => { drawing = false; };
    cv.addEventListener("touchstart",  (e) => { e.preventDefault(); drawing = true; [lx, ly] = xy(e); ctx.beginPath(); ctx.moveTo(lx, ly); }, { passive: false });
    cv.addEventListener("touchmove",   (e) => { e.preventDefault(); if (!drawing) return; const [x, y] = xy(e); ctx.lineTo(x, y); ctx.stroke(); lx = x; ly = y; }, { passive: false });
    cv.addEventListener("touchend",    () => { drawing = false; });
  }
  function clearSigCanvas(ref: React.RefObject<HTMLCanvasElement | null>) {
    const cv = ref.current; if (!cv) return;
    cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height);
  }
  function isSigEmpty(ref: React.RefObject<HTMLCanvasElement | null>) {
    const cv = ref.current; if (!cv) return true;
    return !cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data.some(v => v !== 0);
  }

  // Dati studio (fissi)
  const STUDIO_DATA = {
    nome:  "Dott. Turchetta Marco",
    titolo: "Fisioterapista",
    studio: "FisioHub · Studi Galileo",
    addr:  "Via La Cupa 15, 03037 Pontecorvo (FR)",
    piva:  "P.IVA 03195120609",
    email: "turchettamarco@gmail.com",
  };

  function buildConsentHtml(type: "privacy" | "consenso", sigDataUrl: string | null, p: NonNullable<typeof patient>): string {
    const nome    = `${p.last_name} ${p.first_name}`.trim();
    const nascita = ddmmyyyy(p.birth_date);
    const cf      = p.tax_code ?? "";
    const citta   = p.residence_city ?? "";
    const tel     = p.phone ?? "";
    const oggi    = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
    const { nome: dNome, titolo, studio, addr, piva, email } = STUDIO_DATA;

    const css = `
      @page { size: A4; margin: 18mm 20mm; }
      @media print { .no-print { display: none !important; } body { margin: 0; } }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Georgia, serif; font-size: 9.5px; line-height: 1.7; color: #1e293b; background: #fff; padding: 16mm 18mm; }
      strong { font-weight: 700; }
      p { margin: 0; }
      ul { padding-left: 14px; }
      li { margin-bottom: 2px; }
      h2 { font-family: Arial, sans-serif; font-size: 9.5px; font-weight: 700; color: #0d9488; text-transform: uppercase; letter-spacing: .6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; margin: 10px 0 5px; }
      .hdr { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 10px; border-bottom: 2px solid #0d9488; margin-bottom: 14px; }
      .hdr-left .name { font-size: 14px; font-weight: 800; color: #0d9488; font-family: Arial, sans-serif; }
      .hdr-left .role { font-size: 10px; color: #334155; font-weight: 600; font-family: Arial, sans-serif; margin-top: 1px; }
      .hdr-left .contact { font-size: 9px; color: #64748b; font-family: Arial, sans-serif; margin-top: 1px; }
      .hdr-right { font-size: 9px; color: #94a3b8; font-family: Arial, sans-serif; text-align: right; }
      .doc-title { text-align: center; margin-bottom: 12px; }
      .doc-title h1 { font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #0f172a; }
      .doc-title p { font-size: 9px; color: #64748b; font-family: Arial, sans-serif; margin-top: 2px; }
      table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 9px; }
      th { background: #0d9488; color: #fff; padding: 4px 7px; text-align: left; }
      td { padding: 4px 7px; border-bottom: 1px solid #e2e8f0; color: #334155; }
      tr.alt td { background: #f8fafc; }
      .box-green { background: #f0fdf4; border: 1px solid #86efac; border-radius: 5px; padding: 8px 12px; margin-top: 10px; }
      .box-warn  { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 5px; padding: 7px 10px; margin: 8px 0; }
      .box-data  { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; }
      .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; }
      .field label { font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 1px; }
      .field .val { border-bottom: 1px solid #94a3b8; min-height: 17px; font-size: 10px; padding: 1px 2px; }
      .checks { font-size: 9.5px; line-height: 2; }
      .firma-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 10px; margin-top: 14px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
      .firma-field label { font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px; }
      .firma-line { border-bottom: 1px solid #334155; min-height: 22px; }
      .sig-img { border: 1px solid #e2e8f0; border-radius: 4px; height: 58px; background: #fafafa; margin-top: 10px; }
      .sig-img img { height: 100%; }
      .footer { margin-top: 14px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
      .btn-print { padding: 9px 24px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: Arial, sans-serif; }`;

    const hdr = `<div class="hdr"><div class="hdr-left"><div class="name">${studio}</div><div class="role">${dNome} — ${titolo}</div><div class="contact">${addr} · ${email} · ${piva}</div></div><div class="hdr-right">Data: ${oggi}</div></div>`;
    const footer = `<div class="footer"><span>${studio} — ${dNome}, ${titolo}</span><span>Generato il ${oggi}</span></div>`;
    const firmaArea = `
      <div class="firma-grid">
        <div><div class="firma-field"><label>Luogo</label><div class="firma-line"></div></div></div>
        <div><div class="firma-field"><label>Data</label><div class="firma-line" style="font-size:10px;padding-top:2px">${oggi}</div></div></div>
        <div><div class="firma-field"><label>Firma professionista</label><div class="firma-line"></div></div></div>
      </div>
      <div class="firma-field"><label>Firma del paziente</label>
        <div class="sig-img">${sigDataUrl ? `<img src="${sigDataUrl}" alt="firma"/>` : ""}</div>
      </div>`;

    if (type === "privacy") {
      return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Informativa Privacy – ${nome}</title><style>${css}</style></head><body>
<div class="no-print" style="padding:12px 0 16px;text-align:center"><button class="btn-print" onclick="window.print()">🖨 Stampa / Salva PDF</button></div>
${hdr}
<div class="doc-title"><h1>Informativa sul trattamento dei dati personali</h1><p>Art. 13 Regolamento UE 2016/679 (GDPR)</p></div>
<h2>1. Titolare del trattamento</h2>
<p><strong>${dNome}</strong>, ${titolo} — ${piva}<br>${addr} · ${email}</p>
<h2>2. Dati personali trattati</h2>
<ul><li><strong>Dati anagrafici:</strong> nome, cognome, data di nascita, codice fiscale, indirizzo, telefono, e-mail</li><li><strong>Dati di salute (Art. 9 GDPR):</strong> anamnesi, diagnosi, referti, cartella clinica fisioterapica</li><li><strong>Dati amministrativi:</strong> fatturazione e pagamento</li></ul>
<h2>3. Finalità e basi giuridiche</h2>
<table><tr><th>Finalità</th><th>Base giuridica</th></tr>
<tr><td>Erogazione prestazioni fisioterapiche</td><td>Art. 9 par. 2 lett. h GDPR</td></tr>
<tr class="alt"><td>Adempimenti di legge (fatturazione, SSN)</td><td>Art. 6 par. 1 lett. c GDPR</td></tr>
<tr><td>Gestione amministrativa e contabile</td><td>Art. 6 par. 1 lett. b GDPR</td></tr>
<tr class="alt"><td>Promemoria appuntamenti (SMS/WhatsApp)</td><td>Art. 6 par. 1 lett. a GDPR — consenso esplicito</td></tr></table>
<h2>4. Conservazione</h2>
<ul><li>Documentazione sanitaria: <strong>10 anni</strong> dalla cessazione del rapporto (D.M. 14/02/1997)</li><li>Documentazione fiscale: <strong>10 anni</strong> dalla data del documento</li><li>I dati non vengono venduti né ceduti a terzi per finalità commerciali</li></ul>
<h2>5. Diritti dell'interessato (Artt. 15–22 GDPR)</h2>
<p>Ha diritto di accesso, rettifica, cancellazione, limitazione, portabilità e opposizione. Può proporre reclamo al Garante: www.garanteprivacy.it — Contatto: ${email}</p>
<div class="box-green">
<p><strong>Io sottoscritto/a</strong> <span style="border-bottom:1px solid #166534;padding:0 50px">${nome}</span> nato/a il <span style="border-bottom:1px solid #166534;padding:0 25px">${nascita}</span> residente in <span style="border-bottom:1px solid #166534;padding:0 35px">${citta}</span><br>
dichiaro di aver letto e compreso la presente informativa e <strong>acconsento al trattamento dei dati di salute</strong> per finalità terapeutiche.</p>
<p style="margin-top:7px">Promemoria via WhatsApp/SMS: <input type="checkbox" checked> <strong>Acconsento</strong> &nbsp;&nbsp;<input type="checkbox"> <strong>Non acconsento</strong></p>
</div>
${firmaArea}
${footer}
</body></html>`;
    } else {
      return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Consenso Trattamento – ${nome}</title><style>${css}</style></head><body>
<div class="no-print" style="padding:12px 0 16px;text-align:center"><button class="btn-print" onclick="window.print()">🖨 Stampa / Salva PDF</button></div>
${hdr}
<div class="doc-title"><h1>Consenso informato al trattamento fisioterapico</h1><p>Legge n. 219/2017 · GDPR Reg. UE 2016/679</p></div>
<div class="box-data">
<div style="font-family:Arial,sans-serif;font-size:8px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Dati del paziente</div>
<div class="data-grid">
<div class="field"><label>Cognome e nome</label><div class="val">${nome}</div></div>
<div class="field"><label>Data di nascita</label><div class="val">${nascita}</div></div>
<div class="field"><label>Codice fiscale</label><div class="val">${cf}</div></div>
<div class="field"><label>Città di residenza</label><div class="val">${citta}</div></div>
<div class="field"><label>Telefono</label><div class="val">${tel}</div></div>
</div>
</div>
<h2>Informazioni ricevute</h2>
<p>Il <strong>${dNome}</strong>, ${titolo}, mi ha illustrato:</p>
<ul style="margin-top:4px"><li><strong>Diagnosi e condizione clinica:</strong> natura del problema, cause e evoluzione attesa</li><li><strong>Trattamento proposto:</strong> terapia manuale, esercizio terapeutico, strumentale (ultrasuoni, TENS, TECAR, laser…)</li><li><strong>Benefici attesi</strong> nel breve, medio e lungo termine</li><li><strong>Rischi:</strong> dolore post-seduta, ecchimosi, aggravamento transitorio dei sintomi</li><li><strong>Alternative terapeutiche</strong>, inclusa la non effettuazione del trattamento</li></ul>
<h2>Dichiarazioni del paziente</h2>
<div class="checks">
<div><input type="checkbox" checked> Ho ricevuto e compreso le informazioni e ho potuto porre domande con risposte esaurienti</div>
<div><input type="checkbox" checked> Non sono a conoscenza di controindicazioni; ho comunicato eventuali condizioni di salute rilevanti</div>
<div><input type="checkbox" checked> Sono consapevole di poter revocare il presente consenso in qualsiasi momento</div>
<div><input type="checkbox" checked> Ho ricevuto copia dell'informativa GDPR e ho espresso il relativo consenso</div>
</div>
<div class="box-warn"><p style="font-size:9px"><strong>Controindicazioni comunicate:</strong> pace-maker o dispositivi impiantati, gravidanza, neoplasie attive, ferite aperte o infezioni, alterazioni della sensibilità cutanea, flebiti e trombosi in fase acuta.</p></div>
<div class="box-green"><p style="font-weight:700;margin-bottom:4px">Espressione del consenso</p><p>Lette e comprese le informazioni, <strong>acconsento liberamente</strong> all'esecuzione del trattamento fisioterapico proposto dal <strong>${dNome}</strong>, nelle modalità concordate.</p></div>
${firmaArea}
${footer}
</body></html>`;
    }
  }

  // Apri in nuova finestra come HTML renderizzato (Blob URL)
  function openHtmlInWindow(html: string) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const w    = window.open(url, "_blank", "noopener,noreferrer");
    if (w) setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Genera e apri per stampa (firma a mano)
  function printConsentDoc(type: "privacy" | "consenso") {
    if (!patient) return;
    const html = buildConsentHtml(type, null, patient);
    openHtmlInWindow(html);
  }

  // Salva su Supabase (con firma digitale embedded)
  async function saveConsents() {
    if (!patient) return;
    if (isSigEmpty(sigPrivacyRef))  { setConsentError("Firma mancante sull'Informativa Privacy."); return; }
    if (isSigEmpty(sigConsensoRef)) { setConsentError("Firma mancante sul Consenso al trattamento."); return; }
    setConsentError(""); setConsentSaving(true);
    const nome = `${patient.last_name} ${patient.first_name}`.trim();
    const sigP = sigPrivacyRef.current!.toDataURL("image/png");
    const sigC = sigConsensoRef.current!.toDataURL("image/png");
    const ts   = Date.now();
    const docs2 = [
      { html: buildConsentHtml("privacy",  sigP, patient), docType: "gdpr_informativa_privacy" as DocType, fname: `Privacy_${nome.replace(/ /g,"_")}_${ts}.html` },
      { html: buildConsentHtml("consenso", sigC, patient), docType: "consenso_trattamento"     as DocType, fname: `Consenso_${nome.replace(/ /g,"_")}_${ts}.html` },
    ];
    for (const doc of docs2) {
      const blob = new Blob([doc.html], { type: "text/html;charset=utf-8" });
      const path = `${patientId}/${doc.fname}`;
      const up   = await supabase.storage.from("patient_docs").upload(path, blob, { upsert: false, contentType: "text/html" });
      if (up.error)  { setConsentError(`Upload fallito: ${up.error.message}`);  setConsentSaving(false); return; }
      const ins  = await supabase.from("patient_documents").insert({ patient_id: patientId, doc_type: doc.docType, file_name: doc.fname, storage_path: path });
      if (ins.error) { setConsentError(`Errore DB: ${ins.error.message}`); setConsentSaving(false); return; }
    }
    setConsentSaving(false); setConsentSaved(true);
    await loadDocs();
    setTimeout(() => { setShowConsentModal(false); setConsentSaved(false); }, 2000);
  }
  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg, fontFamily: "'Outfit', 'Segoe UI', system-ui, sans-serif" }}>

      {/* ━━━ MODAL CONSENSI ━━━ */}
      {showConsentModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 16px", overflowY: "auto" }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 920, boxShadow: "0 24px 64px rgba(0,0,0,0.3)", marginBottom: 20 }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: `1px solid ${THEME.border}` }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: THEME.text }}>🔏 Genera consensi</div>
                <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>Firma entrambi i documenti con Apple Pencil o mouse · vengono salvati automaticamente</div>
              </div>
              <button onClick={() => { setShowConsentModal(false); setConsentSaved(false); setConsentError(""); }} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${THEME.border}`, background: THEME.panelSoft, cursor: "pointer", fontSize: 16, color: THEME.muted }}>✕</button>
            </div>

            <div style={{ padding: "18px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

              {/* Informativa Privacy */}
              <div style={{ border: `1.5px solid ${THEME.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(135deg, #0d9488, #0891b2)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>1 · Informativa Privacy GDPR</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>Art. 13 Reg. UE 2016/679</div>
                  </div>
                  <button onClick={() => printConsentDoc("privacy")} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🖨 Stampa</button>
                </div>
                <div style={{ padding: "12px 14px", maxHeight: 300, overflowY: "auto", fontSize: 10.5, lineHeight: 1.65, color: THEME.text }}>
                  <p style={{ marginBottom: 6 }}><strong>Titolare:</strong> Dott. Turchetta Marco, Fisioterapista, P.IVA 03195120609, Via La Cupa 15 Pontecorvo FR</p>
                  <p style={{ marginBottom: 4 }}><strong>Dati trattati:</strong> anagrafici, dati di salute (Art. 9 GDPR), amministrativi.</p>
                  <p style={{ marginBottom: 4 }}><strong>Finalità:</strong> prestazioni fisioterapiche, obblighi di legge, gestione amministrativa, promemoria appuntamenti (con consenso).</p>
                  <p style={{ marginBottom: 4 }}><strong>Conservazione:</strong> 10 anni per documentazione sanitaria e fiscale.</p>
                  <p style={{ marginBottom: 6 }}><strong>Diritti (Artt. 15–22):</strong> accesso, rettifica, cancellazione, limitazione, portabilità, opposizione.</p>
                  <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, padding: "8px 10px" }}>
                    <p><strong>Io sottoscritto/a</strong> {patient?.last_name} {patient?.first_name} dichiaro di aver letto e compreso l'informativa e <strong>acconsento al trattamento dei dati di salute</strong> per finalità terapeutiche.</p>
                    <p style={{ marginTop: 5 }}><input type="checkbox" defaultChecked readOnly /> Acconsento ai promemoria WhatsApp/SMS</p>
                  </div>
                </div>
                <div style={{ padding: "12px 14px", borderTop: `1px solid ${THEME.border}`, background: THEME.panelSoft }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Firma del paziente</div>
                  <canvas
                    ref={el => { if (el && !el.onmousedown) { (sigPrivacyRef as React.MutableRefObject<HTMLCanvasElement>).current = el; setTimeout(() => initSigCanvas(sigPrivacyRef), 80); } }}
                    height={90}
                    style={{ display: "block", width: "100%", border: "1.5px dashed #94a3b8", borderRadius: 6, background: "#fff", touchAction: "none", cursor: "crosshair" }}
                  />
                  <button onClick={() => clearSigCanvas(sigPrivacyRef)} style={{ marginTop: 5, padding: "3px 10px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.muted, fontSize: 11, cursor: "pointer" }}>Cancella</button>
                </div>
              </div>

              {/* Consenso trattamento */}
              <div style={{ border: `1.5px solid ${THEME.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>2 · Consenso al trattamento fisioterapico</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>Legge n. 219/2017</div>
                  </div>
                  <button onClick={() => printConsentDoc("consenso")} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🖨 Stampa</button>
                </div>
                <div style={{ padding: "12px 14px", maxHeight: 300, overflowY: "auto", fontSize: 10.5, lineHeight: 1.65, color: THEME.text }}>
                  <p style={{ marginBottom: 6 }}><strong>Paziente:</strong> {patient?.last_name} {patient?.first_name} · {ddmmyyyy(patient?.birth_date ?? null)} · {patient?.tax_code} · {patient?.residence_city} · {patient?.phone}</p>
                  <p style={{ marginBottom: 4 }}>Il <strong>Dott. Turchetta Marco</strong> mi ha illustrato: diagnosi, trattamento proposto (terapia manuale, esercizio, strumentale), benefici, rischi (dolore post-seduta, ecchimosi, aggravamento transitorio), alternative terapeutiche.</p>
                  <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 5, padding: "6px 10px", margin: "6px 0", fontSize: 10 }}>
                    <strong>Controindicazioni:</strong> pace-maker, gravidanza, neoplasie attive, ferite aperte, flebiti in fase acuta.
                  </div>
                  <div style={{ fontSize: 10.5, lineHeight: 2 }}>
                    <div><input type="checkbox" defaultChecked readOnly /> Ho ricevuto e compreso le informazioni</div>
                    <div><input type="checkbox" defaultChecked readOnly /> Non sono a conoscenza di controindicazioni</div>
                    <div><input type="checkbox" defaultChecked readOnly /> Posso revocare il consenso in qualsiasi momento</div>
                    <div><input type="checkbox" defaultChecked readOnly /> Ho ricevuto copia dell'informativa GDPR</div>
                  </div>
                  <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, padding: "8px 10px", marginTop: 6 }}>
                    <p><strong>Acconsento liberamente</strong> all'esecuzione del trattamento fisioterapico nelle modalità concordate.</p>
                  </div>
                </div>
                <div style={{ padding: "12px 14px", borderTop: `1px solid ${THEME.border}`, background: THEME.panelSoft }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Firma del paziente</div>
                  <canvas
                    ref={el => { if (el && !el.onmousedown) { (sigConsensoRef as React.MutableRefObject<HTMLCanvasElement>).current = el; setTimeout(() => initSigCanvas(sigConsensoRef), 80); } }}
                    height={90}
                    style={{ display: "block", width: "100%", border: "1.5px dashed #94a3b8", borderRadius: 6, background: "#fff", touchAction: "none", cursor: "crosshair" }}
                  />
                  <button onClick={() => clearSigCanvas(sigConsensoRef)} style={{ marginTop: 5, padding: "3px 10px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.muted, fontSize: 11, cursor: "pointer" }}>Cancella</button>
                </div>
              </div>
            </div>

            {/* Footer modal */}
            <div style={{ padding: "14px 24px 18px", borderTop: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                {consentError && <div style={{ fontSize: 12, color: THEME.red, fontWeight: 600 }}>⚠️ {consentError}</div>}
                {consentSaved && <div style={{ fontSize: 12, color: THEME.green, fontWeight: 700 }}>✓ Documenti firmati e salvati!</div>}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setShowConsentModal(false); setConsentError(""); }} style={{ padding: "10px 18px", borderRadius: 8, border: `1.5px solid ${THEME.border}`, background: "#fff", color: THEME.muted, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Annulla</button>
                <button onClick={saveConsents} disabled={consentSaving || consentSaved} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: consentSaved ? THEME.green : "linear-gradient(135deg, #0d9488, #2563eb)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: consentSaving ? "wait" : "pointer", opacity: consentSaving ? 0.7 : 1 }}>
                  {consentSaving ? "Salvataggio…" : consentSaved ? "✓ Salvati!" : "✓ Conferma firma e salva"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        * { -webkit-font-smoothing: antialiased; box-sizing: border-box; }
        body { font-family: 'Outfit','Segoe UI',system-ui,sans-serif; margin:0; background:${THEME.appBg}; }
        select, input, textarea, button { font-family: inherit; }
        input:focus, select:focus, textarea:focus {
          border-color: ${THEME.blue} !important;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12) !important;
          outline: none !important;
        }
        @media (min-width: 768px) and (max-width: 1024px) {
          .tab-hide    { display: none !important; }
          .tab-compact { font-size: 11px !important; padding: 3px 8px !important; }
          .tab-grid-2  { grid-template-columns: 1fr 1fr !important; }
          .tab-p       { padding: 20px 18px !important; }
        }
      `}</style>

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 30,
        background: "linear-gradient(135deg, #0d9488, #2563eb)",
        padding: "0 20px", height: 58,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 2px 12px rgba(13,148,136,0.18)", gap: 8,
      }}>
        {/* Left: Logo + Nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 800, fontSize: 14,
              border: "1.5px solid rgba(255,255,255,0.3)",
            }}>F</div>
            <span style={{ fontWeight: 700, fontSize: 15, color: "#fff", letterSpacing: 0.5, textTransform: "uppercase" }}>
              Fisio<span style={{ fontWeight: 800 }}>Hub</span>
            </span>
          </div>
          <nav style={{ display: "flex", gap: 2 }}>
            {([
              { href: "/",         label: "Home",       icon: "⌂",  active: false },
              { href: "/calendar", label: "Calendario", icon: "▦",  active: false },
              { href: "/reports",  label: "Report",     icon: "◈",  active: false },
              { href: "/patients", label: "Pazienti",   icon: "◉",  active: true  },
            ] as const).map(item => (
              <Link key={item.href} href={item.href} style={{
                padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                textDecoration: "none", transition: "all 0.2s",
                background: item.active ? "rgba(255,255,255,0.2)" : "transparent",
                color: item.active ? "#fff" : "rgba(255,255,255,0.8)",
                letterSpacing: 0.3,
              }}>
                <span className="tab-compact">{item.icon} {item.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* Right: avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div ref={userMenuRef} style={{ position: "relative" }}>
            <button onClick={() => setUserMenuOpen(v => !v)} style={{
              width: 32, height: 32, borderRadius: 8,
              border: "1.5px solid rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.2)",
              color: "#fff", fontWeight: 800, fontSize: 12,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>{userInitials}</button>

            {userMenuOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 8px)", width: 210,
                background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
                borderRadius: 12, boxShadow: "0 12px 32px rgba(30,64,175,0.15)",
                overflow: "hidden", zIndex: 60,
              }}>
                <div style={{ padding: "12px 16px", borderBottom: `1.5px solid ${THEME.border}`, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                  {userEmail}
                </div>
                <Link href="/settings" onClick={() => setUserMenuOpen(false)} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                  color: THEME.text, textDecoration: "none", fontSize: 13, fontWeight: 600,
                  borderBottom: `1.5px solid ${THEME.border}`,
                }}>⚙️ Impostazioni</Link>
                <button onClick={handleLogout} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 16px", background: "transparent", border: "none",
                  cursor: "pointer", color: THEME.red, fontWeight: 600, fontSize: 13,
                }}>⏻ Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ━━━ MAIN ━━━ */}
      <main style={{ padding: "28px 32px", maxWidth: 1280, margin: "0 auto" }} className="tab-p">

        {/* Page header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: THEME.teal, boxShadow: `0 0 0 4px rgba(13,148,136,0.15)` }} />
              <h1 style={{ margin: 0, fontWeight: 800, fontSize: 26, color: THEME.text, letterSpacing: -0.5 }}>
                {headerName}
              </h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              {patient.phone && (
                <span style={{ fontSize: 14, fontWeight: 700, color: THEME.textSoft }}>
                  📞 {patient.phone}
                </span>
              )}
              <span style={{ fontSize: 13, color: THEME.muted, fontWeight: 600 }}>
                🎂 {ddmmyyyy(patient.birth_date)}
              </span>
              <span style={{ fontSize: 13, color: THEME.muted, fontWeight: 600 }}>
                🧾 {patient.preferred_plan === "invoice" ? "Fattura" : patient.preferred_plan === "no_invoice" ? "Non fattura" : "—"}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/patients" style={{
              padding: "9px 16px", borderRadius: 8, border: `1.5px solid ${THEME.border}`,
              background: THEME.panelBg, color: THEME.textSoft, fontWeight: 700,
              textDecoration: "none", fontSize: 13, display: "inline-flex", alignItems: "center",
            }}>← Lista</Link>
            <Link href="/calendar" style={{
              padding: "9px 16px", borderRadius: 8, border: `1.5px solid ${THEME.border}`,
              background: THEME.panelBg, color: THEME.blue, fontWeight: 700,
              textDecoration: "none", fontSize: 13, display: "inline-flex", alignItems: "center",
            }}>📅 Calendario</Link>
            <button onClick={deletePatient} disabled={deletingPatient} style={{
              padding: "9px 16px", borderRadius: 8, border: `1.5px solid ${THEME.red}`,
              background: "rgba(220,38,38,0.06)", color: THEME.red, fontWeight: 700,
              fontSize: 13, cursor: deletingPatient ? "not-allowed" : "pointer",
              opacity: deletingPatient ? 0.6 : 1,
            }}>
              {deletingPatient ? "Elimino…" : "Elimina paziente"}
            </button>
            <button onClick={() => setShowConsentModal(true)} style={{
              padding: "9px 16px", borderRadius: 8, border: "none",
              background: "linear-gradient(135deg, #0d9488, #2563eb)",
              color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>🔏 Genera consensi</button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            marginBottom: 16, padding: "12px 16px", borderRadius: 8,
            background: "rgba(249,115,22,0.08)", border: `1px solid rgba(249,115,22,0.3)`,
            color: "#92400e", fontWeight: 600, fontSize: 13,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── KPI ─────────────────────────────────────────────────────────── */}
        <div style={{
          background: "linear-gradient(135deg, #0c4a6e 0%, #0d9488 60%, #0f766e 100%)",
          borderRadius: 14, marginBottom: 16, overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <div style={{ display: "flex", flexWrap: "wrap" }} className="tab-grid-2">
            {[
              {
                label: "Sedute totali",
                value: String(therapiesCount),
                sub: therapiesCount > 0 ? `${Math.round((doneCount/therapiesCount)*100)}% completate` : "nessuna seduta",
                highlight: false,
              },
              {
                label: "Eseguite",
                value: `${doneCount}/${therapiesCount}`,
                sub: doneCount === therapiesCount && therapiesCount > 0 ? "tutte eseguite ✓" : `${therapiesCount - doneCount} rimaste`,
                highlight: doneCount === therapiesCount && therapiesCount > 0,
              },
              {
                label: "Eseguite e pagate",
                value: String(paidCount),
                sub: doneCount > 0 ? `${Math.round((paidCount/doneCount)*100)}% saldate` : "—",
                highlight: paidCount === doneCount && doneCount > 0,
              },
              {
                label: "Ultima seduta",
                value: lastTherapy ? formatDateTimeIT(lastTherapy).split(" ")[0] : "—",
                sub: lastTherapy ? formatDateTimeIT(lastTherapy).split(" ").slice(1).join(" ") : "nessuna seduta",
                highlight: false,
              },
            ].map((k, i) => (
              <div key={k.label} style={{
                flex: "1 1 160px", minWidth: 0,
                padding: "18px 22px 20px",
                borderRight: i < 3 ? "1px solid rgba(255,255,255,0.10)" : "none",
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: k.highlight ? "#86efac" : "#fff", lineHeight: 1, marginBottom: 4, letterSpacing: -0.5 }}>{k.value}</div>
                <div style={{ fontSize: 12, color: k.highlight ? "#86efac" : "rgba(255,255,255,0.5)", fontWeight: 500 }}>{k.sub}</div>
              </div>
            ))}
          </div>
          {/* Progress bar completamento */}
          {therapiesCount > 0 && (
            <div style={{ height: 3, background: "rgba(255,255,255,0.10)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((doneCount/therapiesCount)*100)}%`, background: "rgba(134,239,172,0.75)", transition: "width 0.5s ease" }}/>
            </div>
          )}
        </div>

        {/* ── ANAGRAFICA ───────────────────────────────────────────────────── */}
        <section style={cardStyle}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 22px", borderBottom:`1px solid ${THEME.border}`, background:"#fff" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:34, height:34, borderRadius:9, background:"rgba(13,148,136,0.08)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17 }}>👤</div>
              <div>
                <span style={{ fontWeight:800, fontSize:14, color:THEME.text }}>Anagrafica</span>
                <div style={{ fontSize:11, color:THEME.muted, fontWeight:600, marginTop:1 }}>{demoEditMode ? "Modalità modifica attiva" : "Clicca Modifica per cambiare i dati"}</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {!demoEditMode ? btnOutline("Modifica", () => setDemoEditMode(true), THEME.teal)
                : <>{btnOutline("Annulla", () => { resetDemographics(); setDemoEditMode(false); })}{btnPrimary(savingDemo ? "Salvataggio…" : "Salva", saveDemographics, savingDemo || !demoDirty)}</>}
            </div>
          </div>
          <div style={cardBody}>

          {/* Campi base */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }} className="tab-grid-2">
            <div>
              <label style={labelStyle}>Nome</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
            </div>
            <div>
              <label style={labelStyle}>Cognome</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
            </div>
            <div>
              <label style={labelStyle}>Telefono</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
            </div>
            <div>
              <label style={labelStyle}>Città</label>
              <input value={resCity} onChange={e => setResCity(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }} className="tab-grid-2">
            <div>
              <label style={labelStyle}>Data di nascita</label>
              <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
              <div style={{ marginTop: 5, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                {ddmmyyyy(birthDate || patient.birth_date)}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Luogo di nascita</label>
              <input value={birthPlace} onChange={e => setBirthPlace(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
            </div>
            <div>
              <label style={labelStyle}>Codice Fiscale</label>
              <input value={taxCode} onChange={e => setTaxCode(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="RSSMRC..." />
              <div style={{ marginTop: 5, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                {normalizeTaxCode(taxCode || patient.tax_code || "") || "—"}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Preferenza documento</label>
              <select value={preferredPlan} onChange={e => setPreferredPlan(e.target.value as Plan)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                <option value="invoice">Fattura</option>
                <option value="no_invoice">Non fattura</option>
              </select>
            </div>
          </div>

          {/* V2 — Dati clinici */}
          <div style={{ borderTop: `1.5px solid ${THEME.border}`, paddingTop: 16, marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: THEME.blueDark }}>Campi avanzati</div>
                <div style={{ fontSize: 11, color: THEME.muted, fontWeight: 600, marginTop: 2 }}>Segmentazione, follow-up, previsioni.</div>
              </div>
            </div>

            {/* Clinica iniziale */}
            <button type="button" onClick={() => setShowV2Clinical(s => !s)} style={{
              width: "100%", textAlign: "left",
              background: "rgba(37,99,235,0.03)", border: `1.5px solid ${THEME.border}`,
              padding: "10px 14px", borderRadius: 8, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontWeight: 700, fontSize: 13, color: THEME.blueDark, marginBottom: showV2Clinical ? 12 : 0,
            }}>
              <span>🧠 Dati clinici iniziali</span>
              <span>{showV2Clinical ? "−" : "+"}</span>
            </button>

            {showV2Clinical && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }} className="tab-grid-2">
                <div style={{ gridColumn: "1 / span 2" }}>
                  <label style={labelStyle}>Motivo principale</label>
                  <textarea value={mainComplaint} onChange={e => setMainComplaint(e.target.value)} rows={3} style={textareaStyle} placeholder="Es. dolore lombare da 3 settimane…" disabled={!demoEditMode} />
                </div>
                <div>
                  <label style={labelStyle}>Distretto</label>
                  <select value={bodyRegion} onChange={e => setBodyRegion(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="">Seleziona</option>
                    <option value="cervicale">Cervicale</option><option value="dorsale">Dorsale</option>
                    <option value="lombare">Lombare</option><option value="spalla">Spalla</option>
                    <option value="gomito">Gomito</option><option value="polso_mano">Polso/Mano</option>
                    <option value="anca">Anca</option><option value="ginocchio">Ginocchio</option>
                    <option value="caviglia_piede">Caviglia/Piede</option><option value="atm">ATM</option>
                    <option value="neurologico">Neurologico</option><option value="altro">Altro</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Lato</label>
                  <select value={side} onChange={e => setSide(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="">Seleziona</option>
                    <option value="dx">DX</option><option value="sx">SX</option><option value="bilaterale">Bilaterale</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Tipo problema</label>
                  <select value={pathologyType} onChange={e => setPathologyType(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="">Seleziona</option>
                    <option value="traumatico">Traumatico</option><option value="degenerativo">Degenerativo</option>
                    <option value="post_chirurgico">Post-chirurgico</option><option value="neurologico">Neurologico</option>
                    <option value="cronico">Cronico</option><option value="funzionale">Funzionale</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Diagnosi medica</label>
                  <input value={medicalDiagnosis} onChange={e => setMedicalDiagnosis(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="Es. discopatia L4-L5" />
                </div>
              </div>
            )}

            {/* Business */}
            <button type="button" onClick={() => setShowV2Business(s => !s)} style={{
              width: "100%", textAlign: "left",
              background: "rgba(22,163,74,0.03)", border: `1.5px solid ${THEME.border}`,
              padding: "10px 14px", borderRadius: 8, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontWeight: 700, fontSize: 13, color: THEME.greenDark, marginBottom: showV2Business ? 12 : 0,
            }}>
              <span>💼 Stato & dati economici</span>
              <span>{showV2Business ? "−" : "+"}</span>
            </button>

            {showV2Business && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }} className="tab-grid-2">
                <div>
                  <label style={labelStyle}>Stato paziente</label>
                  <select value={patientStatus} onChange={e => setPatientStatus(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="active">Attivo</option><option value="lead">Lead</option>
                    <option value="paused">In pausa</option><option value="follow_up">Follow-up</option>
                    <option value="discharged">Dimesso</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Canale acquisizione</label>
                  <select value={acquisitionChannel} onChange={e => setAcquisitionChannel(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="">Seleziona</option>
                    <option value="passaparola">Passaparola</option><option value="medico">Medico</option>
                    <option value="instagram">Instagram</option><option value="google">Google</option>
                    <option value="evento">Evento</option><option value="altro">Altro</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Data primo contatto</label>
                  <input type="date" value={firstVisitDate} onChange={e => setFirstVisitDate(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
                </div>
                <div>
                  <label style={labelStyle}>Frequenza prevista (sett.)</label>
                  <input value={expectedFrequency} onChange={e => setExpectedFrequency(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="Es. 2" />
                </div>
                <div>
                  <label style={labelStyle}>Pacchetto sedute</label>
                  <input value={packageSize} onChange={e => setPackageSize(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="Es. 10" />
                </div>
              </div>
            )}

            <p style={{ margin: "12px 0 0", fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
              Questi campi si salvano con il bottone "Salva anagrafica".
            </p>
          </div>
          </div>
        </section>

        {/* ── CLINICA ──────────────────────────────────────────────────────── */}
        <section style={cardStyle}>
          <SecHeader icon="🩺" title="Clinica" subtitle="Anamnesi · Diagnosi · Trattamento" open={secClinica} onToggle={()=>setSecClinica(s=>!s)}
            extra={<div style={{display:"flex",gap:8}} onClick={e=>e.stopPropagation()}>{btnOutline("Ripristina",resetClinical,THEME.muted,!clinicalDirty)}{btnPrimary(savingClinical?"Salvataggio…":"Salva",saveClinical,savingClinical||!clinicalDirty)}</div>}
          />
          {secClinica && (
          <div style={cardBody}>
            <div style={{ background: THEME.panelSoft, border: `1.5px solid ${THEME.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>🧩 Anamnesi</div>
              <textarea value={anamnesis} onChange={e => setAnamnesis(e.target.value)} rows={8} style={{ ...textareaStyle, marginTop: 0 }} placeholder="Storia del problema, red flags, farmaci, obiettivi…" />
            </div>
            <div style={{ background: THEME.panelSoft, border: `1.5px solid ${THEME.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>🧠 Diagnosi / ipotesi clinica</div>
              <textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)} rows={8} style={{ ...textareaStyle, marginTop: 0 }} placeholder="Diagnosi medica, ragionamento clinico, test positivi/negativi…" />
            </div>

          {/* Diario sedute */}
          <button type="button" onClick={() => setShowTreatmentDiary(s => !s)} style={{
            width: "100%", textAlign: "left",
            background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
            padding: "12px 16px", borderRadius: 8, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontWeight: 700, fontSize: 13, color: THEME.text, marginBottom: 12,
          }}>
            <span>🗂️ Trattamento & Diario sedute</span>
            <span style={{ color: THEME.blue }}>{showTreatmentDiary ? "−" : "+"}</span>
          </button>

          {showTreatmentDiary && (
            <div style={{ border: `1.5px solid ${THEME.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ padding: "10px 16px", background: THEME.panelSoft, borderBottom: `1.5px solid ${THEME.border}` }}>
                <p style={{ margin: 0, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                  Note per singola seduta. Salvate in <code>appointments.calendar_note</code>.
                </p>
              </div>
              {appointments.length === 0 ? (
                <div style={{ padding: 20, color: THEME.muted, fontWeight: 600, fontSize: 13 }}>
                  Nessuna seduta trovata. Le note appariranno non appena inizi a registrare appuntamenti.
                </div>
              ) : (
                <div style={{ padding: 14, display: "grid", gap: 12 }}>
                  {appointments.map(a => {
                    const busy = !!noteBusyByApptId[a.id];
                    const c   = statusColors(a.status);
                    const val = notesByApptId[a.id] ?? "";
                    return (
                      <div key={a.id} style={{ border: `1.5px solid ${THEME.border}`, borderRadius: 8, padding: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, color: THEME.text, fontSize: 13 }}>{formatDateTimeIT(a.start_at)}</span>
                            <span style={{
                              display: "inline-flex", alignItems: "center",
                              padding: "4px 10px", borderRadius: 6,
                              background: c.bg, border: `1px solid ${c.bd}`,
                              color: c.fg, fontWeight: 700, fontSize: 11,
                            }}>{statusLabel(a.status)}</span>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button type="button" onClick={() => applyNoteTemplate(a.id)} style={{
                              padding: "7px 12px", borderRadius: 6, border: `1.5px solid ${THEME.border}`,
                              background: THEME.panelBg, color: THEME.blue, fontWeight: 700, cursor: "pointer", fontSize: 12,
                            }}>Usa template</button>
                            <button type="button" onClick={() => saveAppointmentNote(a.id)} disabled={busy} style={{
                              padding: "7px 12px", borderRadius: 6, border: "none",
                              background: busy ? THEME.gray : THEME.teal,
                              color: "#fff", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontSize: 12,
                              opacity: busy ? 0.65 : 1,
                            }}>{busy ? "Salvo…" : "Salva nota"}</button>
                          </div>
                        </div>
                        <textarea value={val} onChange={e => setNotesByApptId(m => ({ ...m, [a.id]: e.target.value }))} rows={4} style={{ ...textareaStyle, marginTop: 0 }} placeholder="Cosa hai fatto oggi? Tecniche, esercizi, progressioni, risposta del paziente…" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Piano trattamento */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              📌 Piano trattamento (generale)
            </div>
            <textarea value={treatment} onChange={e => setTreatment(e.target.value)} rows={5} style={textareaStyle} placeholder="Il piano generale: frequenza, progressione, obiettivi a 2-4 settimane…" />
          </div>
          </div>
          )}
        </section>

        {/* ── BODY CHART ───────────────────────────────────────────────────── */}
        <section style={cardStyle}>
          <SecHeader icon="🗺" title="Body Chart — Mappa del Dolore" subtitle="Dipingi le zone dolorose · irradiazioni · referto PDF" open={secBodyChart} onToggle={()=>setSecBodyChart(s=>!s)}/>
          {secBodyChart && (
            <div style={cardBody}>
              <PainMapSection patientName={patient ? `${patient.last_name} ${patient.first_name}`.trim() : "Paziente"}/>
            </div>
          )}
        </section>

        {/* ── DOCUMENTI CLINICI ─────────────────────────────────────────────── */}
        <section style={cardStyle}>
          <SecHeader icon="📋" title="Documenti Clinici" subtitle={`${clinicalDocs.length} documenti · immagini e PDF`} open={secDocClinici} onToggle={()=>setSecDocClinici(s=>!s)}
            badge={clinicalDocs.length>0?<span style={{fontSize:11,fontWeight:700,color:THEME.blue,background:"rgba(37,99,235,0.1)",padding:"2px 8px",borderRadius:99}}>{clinicalDocs.length}</span>:undefined}
            extra={<div onClick={e=>e.stopPropagation()}>{btnOutline(loadingClinicalDocs?"Aggiorno…":"Aggiorna",loadClinicalDocs,THEME.blue,loadingClinicalDocs)}</div>}
          />
          {secDocClinici && (
          <div style={cardBody}>
          <div style={{ border: `1.5px solid ${THEME.border}`, borderRadius: 10, padding: 16, background: THEME.panelSoft, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Tipo documento</label>
                <select value={clinicalUploadType} onChange={e => setClinicalUploadType(e.target.value as ClinicalDocType)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }}>
                  <option value="prescrizione">Prescrizione</option>
                  <option value="rx">Rx (Radiografia)</option>
                  <option value="rm">RM (Risonanza Magnetica)</option>
                  <option value="tac">TAC</option>
                  <option value="elettromiografia">Elettromiografia</option>
                  <option value="ecografia">Ecografia</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Nome (opzionale)</label>
                <input value={clinicalUploadTitle} onChange={e => setClinicalUploadTitle(e.target.value)} style={inputStyle} placeholder="Es. RM Lombare 12-02-2026" />
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={labelStyle}>File (immagini o PDF)</label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" onChange={e => setClinicalUploadFile(e.target.files?.[0] || null)} style={inputStyle} />
                {clinicalUploadFile && (
                  <div style={{ marginTop: 6, fontSize: 12, color: THEME.green, fontWeight: 700 }}>
                    ✓ {clinicalUploadFile.name}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {btnPrimary(savingClinicalDoc === "upload" ? "Carico…" : "Carica documento", uploadClinicalDocument, savingClinicalDoc === "upload")}
            </div>
          </div>

          {/* Lista documenti clinici */}
          {clinicalDocs.length === 0 ? (
            <div style={{ fontSize: 13, color: THEME.muted, fontWeight: 600 }}>Nessun documento clinico caricato.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {clinicalDocs.map(doc => (
                <div key={doc.id} style={{
                  border: `1.5px solid ${THEME.border}`, borderRadius: 8, padding: "12px 16px",
                  background: THEME.panelBg, display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                }}>
                  <div>
                    <div style={{ fontWeight: 700, color: THEME.text, fontSize: 13 }}>
                      {clinicalDocTypeLabel(doc.doc_type)} · {doc.file_name || "Documento"}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                      {new Date(doc.uploaded_at).toLocaleString("it-IT")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {btnOutline("Apri", () => openClinicalDocument(doc))}
                    <button type="button" onClick={() => deleteClinicalDocument(doc)} style={{
                      padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${THEME.red}`,
                      background: "rgba(220,38,38,0.06)", color: THEME.red, fontWeight: 700, fontSize: 13, cursor: "pointer",
                    }}>Elimina</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
          )}
        </section>

        {/* ── TERAPIE + PAGAMENTO ───────────────────────────────────────────── */}
        <section style={{ ...cardStyle }}>
          <SecHeader
            icon="📅"
            title="Terapie fatte"
            subtitle="Stato e pagamento per ogni seduta"
            open={secTerapie}
            onToggle={() => setSecTerapie(s => !s)}
            extra={!secTerapie && btnOutline(loadingAppts ? "Aggiorno…" : "Aggiorna", loadAppointments, THEME.blue, loadingAppts)}
            badge={!secTerapie && appointments.length > 0
              ? <span style={{ background:"rgba(22,163,74,0.1)", color:THEME.teal, fontWeight:800, fontSize:12, borderRadius:99, padding:"2px 10px", border:"1px solid rgba(22,163,74,0.2)" }}>
                  {appointments.filter(a=>a.status==="done").length} sedute
                </span>
              : undefined}
          />
          {secTerapie && (
          <div style={cardBody}>
            <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
              {btnOutline(loadingAppts ? "Aggiorno…" : "Aggiorna", loadAppointments, THEME.blue, loadingAppts)}
            </div>

          {appointments.length === 0 && !loadingAppts ? (
            <div style={{ fontSize: 13, color: THEME.muted, fontWeight: 600 }}>Nessuna seduta trovata.</div>
          ) : (
            <div style={{ overflow: "hidden", borderRadius: 10, border: `1.5px solid ${THEME.border}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Data", "Stato", "Pagata"].map(h => (
                      <th key={h} style={tableHeaderStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((a, idx) => {
                    const busy = !!rowBusy[a.id];
                    const c    = statusColors(a.status);
                    const selectStyle: React.CSSProperties = {
                      padding: "5px 10px", borderRadius: 6,
                      border: `1.5px solid ${c.bd}`, background: c.bg,
                      color: c.fg, fontWeight: 700, fontSize: 12,
                      cursor: busy ? "not-allowed" : "pointer", outline: "none",
                    };
                    return (
                      <tr key={a.id} style={{ background: idx % 2 === 0 ? "#fff" : THEME.panelSoft, borderBottom: `1px solid ${THEME.border}` }}>
                        <td style={{ padding: "12px 14px", color: THEME.text, fontWeight: 700, fontSize: 13 }}>
                          {formatDateTimeIT(a.start_at)}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center",
                              padding: "5px 10px", borderRadius: 6,
                              background: c.bg, border: `1.5px solid ${c.bd}`,
                              color: c.fg, fontWeight: 700, fontSize: 12,
                            }}>{statusLabel(a.status)}</span>
                            <select
                              value={a.status}
                              disabled={busy}
                              onChange={e => updateTherapyStatus(a.id, e.target.value as Status)}
                              style={selectStyle}
                            >
                              <option value="booked">Prenotata</option>
                              <option value="confirmed">Confermata</option>
                              <option value="done">Eseguita</option>
                            </select>
                            {busy && <span style={{ fontSize: 12, color: THEME.muted }}>Salvo…</span>}
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13 }}>
                            <input
                              type="checkbox"
                              checked={a.is_paid}
                              disabled={busy || a.status !== "done"}
                              onChange={e => togglePaid(a.id, e.target.checked)}
                              style={{ width: 16, height: 16 }}
                            />
                            <span style={{ color: a.status === "done" ? THEME.textSoft : THEME.muted }}>
                              {a.status === "done" ? (a.is_paid ? "Pagata" : "Non pagata") : "—"}
                            </span>
                          </label>
                          {a.status !== "done" && (
                            <div style={{ marginTop: 4, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                              Pagamento attivo solo se eseguita.
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ margin: "10px 0 0", fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
            Nota: "Annullato" mantiene lo storico · se una seduta torna da "Eseguita" a un altro stato, il pagamento viene azzerato.
          </p>
          </div>
          )}
        </section>

        {/* ── GDPR ──────────────────────────────────────────────────────────── */}
        <section style={{ ...cardStyle }}>
          <SecHeader
            icon="🔏"
            title="Documenti GDPR"
            subtitle="Genera · stampa · firma · archivia"
            open={secGDPR}
            onToggle={() => setSecGDPR(s => !s)}
            badge={!secGDPR && docs.length > 0
              ? <span style={{ background:"rgba(249,115,22,0.1)", color:THEME.amber, fontWeight:800, fontSize:12, borderRadius:99, padding:"2px 10px", border:"1px solid rgba(249,115,22,0.2)" }}>
                  {docs.length} doc
                </span>
              : undefined}
          />
          {secGDPR && (
          <div style={cardBody}>

            {/* Genera e firma digitale */}
            <div style={{ background: THEME.panelSoft, borderRadius: 10, border: `1px solid ${THEME.border}`, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Genera moduli</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                {/* Informativa Privacy */}
                <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ background: "linear-gradient(135deg, #0d9488, #0891b2)", padding: "8px 12px" }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#fff" }}>📄 Informativa Privacy GDPR</div>
                  </div>
                  <div style={{ padding: "10px 12px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => printConsentDoc("privacy")} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "#0d9488", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>🖨 Stampa (firma a mano)</button>
                    <button onClick={() => setShowConsentModal(true)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${THEME.teal}`, background: "#fff", color: THEME.teal, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>✍️ Firma su iPad</button>
                  </div>
                </div>
                {/* Consenso trattamento */}
                <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)", padding: "8px 12px" }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#fff" }}>📄 Consenso al trattamento</div>
                  </div>
                  <div style={{ padding: "10px 12px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => printConsentDoc("consenso")} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>🖨 Stampa (firma a mano)</button>
                    <button onClick={() => setShowConsentModal(true)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid #7c3aed`, background: "#fff", color: "#7c3aed", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>✍️ Firma su iPad</button>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowConsentModal(true)} style={{ width: "100%", padding: "9px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #0d9488, #2563eb)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                🔏 Firma entrambi su iPad e salva automaticamente
              </button>
            </div>

            {/* Upload manuale */}
            <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Carica documento firmato (PDF o immagine)</div>
            <div style={{ display: "flex", justifyContent:"flex-end", marginBottom: 8 }}>
              {btnOutline(loadingDocs ? "Aggiorno…" : "Aggiorna", loadDocs, THEME.blue, loadingDocs)}
            </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 16 }} className="tab-grid-2">
            <div>
              <label style={labelStyle}>Tipo documento</label>
              <select value={docType} onChange={e => setDocType(e.target.value as DocType)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }}>
                <option value="gdpr_informativa_privacy">GDPR – Informativa Privacy</option>
                <option value="consenso_trattamento">Consenso al trattamento</option>
                <option value="altro">Altro</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>File</label>
              <input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1 / span 2", display: "flex", justifyContent: "flex-end" }}>
              {btnPrimary(uploading ? "Caricamento…" : "Carica documento", uploadDocument, uploading)}
            </div>
          </div>

          {docs.length === 0 && !loadingDocs ? (
            <div style={{ fontSize: 13, color: THEME.muted, fontWeight: 600 }}>Nessun documento caricato.</div>
          ) : (
            <div style={{ overflow: "hidden", borderRadius: 10, border: `1.5px solid ${THEME.border}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Tipo", "File", "Caricato", "Azioni"].map(h => (
                      <th key={h} style={tableHeaderStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d, idx) => (
                    <tr key={d.id} style={{ background: idx % 2 === 0 ? "#fff" : THEME.panelSoft, borderBottom: `1px solid ${THEME.border}` }}>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: THEME.text, fontSize: 13 }}>{docTypeLabel(d.doc_type)}</td>
                      <td style={{ padding: "12px 14px", color: THEME.textSoft, fontSize: 13 }}>{d.file_name}</td>
                      <td style={{ padding: "12px 14px", color: THEME.muted, fontSize: 12 }}>{new Date(d.uploaded_at).toLocaleString("it-IT")}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          {btnOutline("Apri", () => openDocument(d))}
                          <button onClick={() => deleteDocument(d)} style={{
                            padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${THEME.red}`,
                            background: "rgba(220,38,38,0.06)", color: THEME.red, fontWeight: 700, fontSize: 13, cursor: "pointer",
                          }}>Elimina</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
          )}
        </section>

      </main>
    </div>
  );
}
