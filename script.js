import { useState, useMemo } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";

// ─── 玩股網月度實際數據 (2021/03–2026/02) + 財報狗當前 ─────────────────────
const MONTHLY_RAW = [
  {y:2021,m:3, pe:21.66,idx:16431},{y:2021,m:4, pe:22.85,idx:17567},
  {y:2021,m:5, pe:17.83,idx:17068},{y:2021,m:6, pe:18.58,idx:17755},
  {y:2021,m:7, pe:18.01,idx:17247},{y:2021,m:8, pe:15.86,idx:17490},
  {y:2021,m:9, pe:15.38,idx:16935},{y:2021,m:10,pe:15.30,idx:16987},
  {y:2021,m:11,pe:14.21,idx:17428},{y:2021,m:12,pe:14.94,idx:18219},
  {y:2022,m:1, pe:14.52,idx:17674},{y:2022,m:2, pe:14.21,idx:17652},
  {y:2022,m:3, pe:13.45,idx:17693},{y:2022,m:4, pe:12.55,idx:16592},
  {y:2022,m:5, pe:12.30,idx:16808},{y:2022,m:6, pe:10.86,idx:14826},
  {y:2022,m:7, pe:10.92,idx:15000},{y:2022,m:8, pe:10.95,idx:15095},
  {y:2022,m:9, pe:9.74, idx:13425},{y:2022,m:10,pe:9.39, idx:12950},
  {y:2022,m:11,pe:10.92,idx:14880},{y:2022,m:12,pe:10.39,idx:14138},
  {y:2023,m:1, pe:11.23,idx:15265},{y:2023,m:2, pe:11.41,idx:15504},
  {y:2023,m:3, pe:13.20,idx:15868},{y:2023,m:4, pe:13.03,idx:15579},
  {y:2023,m:5, pe:16.13,idx:16579},{y:2023,m:6, pe:16.46,idx:16916},
  {y:2023,m:7, pe:16.80,idx:17145},{y:2023,m:8, pe:18.09,idx:16635},
  {y:2023,m:9, pe:17.79,idx:16354},{y:2023,m:10,pe:17.53,idx:16001},
  {y:2023,m:11,pe:20.48,idx:17434},{y:2023,m:12,pe:21.12,idx:17931},
  {y:2024,m:1, pe:21.17,idx:17890},{y:2024,m:2, pe:22.96,idx:18967},
  {y:2024,m:3, pe:23.53,idx:20294},{y:2024,m:4, pe:23.67,idx:20397},
  {y:2024,m:5, pe:22.42,idx:21174},{y:2024,m:6, pe:24.40,idx:23032},
  {y:2024,m:7, pe:23.56,idx:22199},{y:2024,m:8, pe:21.71,idx:22268},
  {y:2024,m:9, pe:21.68,idx:22225},{y:2024,m:10,pe:22.27,idx:22820},
  {y:2024,m:11,pe:20.52,idx:22263},{y:2024,m:12,pe:21.29,idx:23035},
  {y:2025,m:1, pe:21.75,idx:23525},{y:2025,m:2, pe:20.46,idx:23053},
  {y:2025,m:3, pe:17.28,idx:20696},{y:2025,m:4, pe:16.89,idx:20235},
  {y:2025,m:5, pe:17.05,idx:21347},{y:2025,m:6, pe:17.78,idx:22256},
  {y:2025,m:7, pe:18.89,idx:23543},{y:2025,m:8, pe:20.05,idx:24233},
  {y:2025,m:9, pe:21.37,idx:25821},{y:2025,m:10,pe:23.32,idx:28233},
  {y:2025,m:11,pe:22.14,idx:27626},{y:2025,m:12,pe:23.22,idx:28964},
  {y:2026,m:1, pe:25.84,idx:32064},{y:2026,m:2, pe:27.46,idx:35414},
  // 財報狗 2026/05/28 最新 (昨日33.26, 今日32.79)
  {y:2026,m:5, pe:32.79,idx:43636,isCurrent:true},
];

// 計算 EPS 基數 = 指數 / 本益比 (= 合計稅後純益等效)
const MONTHLY = MONTHLY_RAW.map(d => ({ ...d, eps: Math.round(d.idx / d.pe) }));

// ─── 年度數據 (1986-2020 年底，來源: TWSE/Goodinfo/MoneyDJ) ──────────────
const ANNUAL = [
  {year:1986,pe:16.2, idx:1400,  outlier:false},
  {year:1987,pe:30.8, idx:2500,  outlier:true },
  {year:1988,pe:14.1, idx:5200,  outlier:false},
  {year:1989,pe:52.7, idx:9624,  outlier:true }, // 泡沫頂峰
  {year:1990,pe:22.4, idx:4530,  outlier:false},
  {year:1991,pe:25.9, idx:4601,  outlier:false},
  {year:1992,pe:23.7, idx:3720,  outlier:false},
  {year:1993,pe:36.8, idx:6070,  outlier:true }, // 盈餘低基期
  {year:1994,pe:27.1, idx:7124,  outlier:false},
  {year:1995,pe:18.9, idx:5180,  outlier:false},
  {year:1996,pe:22.6, idx:6933,  outlier:false},
  {year:1997,pe:28.2, idx:8188,  outlier:false},
  {year:1998,pe:22.8, idx:6418,  outlier:false},
  {year:1999,pe:31.5, idx:8448,  outlier:false},
  {year:2000,pe:14.7, idx:4739,  outlier:false},
  {year:2001,pe:38.9, idx:5551,  outlier:true }, // 9/11 盈餘崩潰
  {year:2002,pe:22.3, idx:4452,  outlier:false},
  {year:2003,pe:21.2, idx:6034,  outlier:false},
  {year:2004,pe:16.1, idx:6139,  outlier:false},
  {year:2005,pe:15.3, idx:6548,  outlier:false},
  {year:2006,pe:17.9, idx:7824,  outlier:false},
  {year:2007,pe:14.8, idx:8506,  outlier:false},
  {year:2008,pe:11.4, idx:4591,  outlier:false},
  {year:2009,pe:55.2, idx:8188,  outlier:true }, // GFC 盈餘崩潰
  {year:2010,pe:16.8, idx:8972,  outlier:false},
  {year:2011,pe:13.1, idx:7072,  outlier:false},
  {year:2012,pe:15.2, idx:7699,  outlier:false},
  {year:2013,pe:17.3, idx:8611,  outlier:false},
  {year:2014,pe:16.2, idx:9307,  outlier:false},
  {year:2015,pe:14.3, idx:8338,  outlier:false},
  {year:2016,pe:14.5, idx:9253,  outlier:false},
  {year:2017,pe:16.1, idx:10642, outlier:false},
  {year:2018,pe:11.8, idx:9727,  outlier:false},
  {year:2019,pe:17.4, idx:11997, outlier:false},
  {year:2020,pe:22.8, idx:14732, outlier:false},
];

// 合併年度PE序列 (用於σ分析)
function getAnnualPE() {
  const monthly_annual = [];
  [2021,2022,2023,2024,2025].forEach(y=>{
    const dec = MONTHLY.find(d=>d.y===y&&d.m===12);
    if(dec) monthly_annual.push({year:y,pe:dec.pe,idx:dec.idx,outlier:false});
  });
  const cur = MONTHLY.find(d=>d.isCurrent);
  if(cur) monthly_annual.push({year:2026,pe:cur.pe,idx:cur.idx,outlier:false,isCurrent:true});
  return [...ANNUAL, ...monthly_annual];
}
const ALL_ANNUAL = getAnnualPE();

// 河流圖用月度數據（帶 PE 帶線）
const BANDS = [8,12,16,20,24,28,32,36];
const BAND_COLORS = {
  8:  "#134e4a", 12: "#166534", 16: "#365314",
  20: "#713f12", 24: "#7c2d12", 28: "#7f1d1d",
  32: "#4c0519", 36: "#450a3a",
};
const BAND_LABEL_COLORS = {
  8:"#34d399",12:"#86efac",16:"#bef264",
  20:"#fde68a",24:"#fb923c",28:"#f87171",
  32:"#fda4af",36:"#d946ef",
};

function buildRiverData(months) {
  return months.map(d => {
    const row = { label: `${d.y}/${String(d.m).padStart(2,'0')}`, pe: d.pe, idx: d.idx, isCurrent: !!d.isCurrent };
    BANDS.forEach(b => { row[`b${b}`] = Math.round(b * d.eps); });
    return row;
  });
}

// σ 工具
function calcStats(vals) {
  if(!vals.length) return {mean:0,std:1,n:0};
  const n=vals.length, mean=vals.reduce((a,b)=>a+b,0)/n;
  return {mean,std:Math.sqrt(vals.reduce((a,v)=>a+(v-mean)**2,0)/Math.max(n-1,1)),n};
}
function zColor(z) {
  const a=Math.abs(z);
  return a>=3?"#dc2626":a>=2?"#ef4444":a>=1?"#f97316":"#22c55e";
}

// ─── PERIOD CONFIG ────────────────────────────────────────────────────────────
const PERIODS = [
  {key:"3y", label:"3年", startYear:2023, color:"#a78bfa"},
  {key:"5y", label:"5年", startYear:2021, color:"#22c55e"},
  {key:"10y",label:"10年",startYear:2016, color:"#0ea5e9"},
  {key:"20y",label:"20年",startYear:2006, color:"#f97316"},
  {key:"40y",label:"40年",startYear:1986, color:"#ec4899"},
];

const CURRENT_PE = 32.79;
const CURRENT_IDX = 43636;
const YESTERDAY_PE = 33.26;

// ─── TOOLTIP ─────────────────────────────────────────────────────────────────
function RiverTooltip({active,payload,label}) {
  if(!active||!payload?.length) return null;
  const row = payload[0]?.payload;
  if(!row) return null;
  const currentBand = BANDS.slice().reverse().find(b => row.idx >= row[`b${b}`]);
  return (
    <div style={{background:"#0f172a",border:"1px solid #334155",borderRadius:8,padding:"10px 14px",minWidth:170}}>
      <div style={{color:"#94a3b8",fontSize:11,marginBottom:4}}>{label} {row.isCurrent?"🔴 當前":""}</div>
      <div style={{color:"#f97316",fontSize:17,fontWeight:700,fontFamily:"monospace"}}>
        PE {row.pe}x
      </div>
      <div style={{color:"#e2e8f0",fontSize:13,fontFamily:"monospace"}}>
        TAIEX {row.idx?.toLocaleString()}
      </div>
      {currentBand&&(
        <div style={{color:BAND_LABEL_COLORS[currentBand],fontSize:11,marginTop:3}}>
          位置: {currentBand}x 帶以上
        </div>
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [view,    setView]    = useState("river");
  const [period,  setPeriod]  = useState("5y");
  const [showOut, setShowOut] = useState(false);
  const [riverRange, setRiverRange] = useState("3y");

  const periodCfg = PERIODS.find(p=>p.key===period);

  // ── 河流圖數據 ──
  const riverMonths = useMemo(()=>{
    const cutYear = riverRange==="3y"?2023:riverRange==="5y"?2021:2019;
    return MONTHLY.filter(d=>d.y>=cutYear);
  },[riverRange]);
  const riverData = useMemo(()=>buildRiverData(riverMonths),[riverMonths]);
  const yMax = useMemo(()=>Math.max(...riverData.map(d=>d.idx))*1.05,[riverData]);

  // EPS 基數 for current
  const currentEPS = Math.round(CURRENT_IDX/CURRENT_PE);

  // ── σ 分析 ──
  const annualSlice = useMemo(()=>
    ALL_ANNUAL.filter(d=>d.year>=periodCfg.startYear&&d.year<=2025)
              .filter(d=>showOut||!d.outlier)
  ,[periodCfg,showOut]);
  const peVals = annualSlice.map(d=>d.pe);
  const {mean,std,n} = useMemo(()=>calcStats(peVals),[peVals]);
  const z = (CURRENT_PE-mean)/std;

  const summaryRows = PERIODS.map(p=>{
    const rows = ALL_ANNUAL.filter(d=>d.year>=p.startYear&&d.year<=2025)
                           .filter(d=>showOut||!d.outlier);
    const s = calcStats(rows.map(d=>d.pe));
    return {...p,...s, z:(CURRENT_PE-s.mean)/s.std};
  });

  const sigmaData = useMemo(()=>
    ALL_ANNUAL.filter(d=>d.year>=periodCfg.startYear)
  ,[periodCfg]);
  const yDomainPE = [0, Math.max(...sigmaData.map(d=>d.pe).filter(Boolean), mean+3*std)+3];

  return (
    <div style={{fontFamily:"'Syne',sans-serif",background:"#030712",minHeight:"100vh",color:"#e2e8f0",padding:"20px 18px"}}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet"/>

      {/* ── 警示橫幅 ── */}
      <div style={{background:"linear-gradient(90deg,#7f1d1d,#450a3a)",border:"1px solid #ef4444",borderRadius:10,padding:"10px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <span style={{fontSize:20}}>🚨</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:"#fca5a5"}}>台股大盤本益比處於極端高估區間</div>
          <div style={{fontSize:11,color:"#fca5a5",opacity:0.8}}>
            當前 PE <b style={{color:"#fff"}}>{CURRENT_PE}x</b>（財報狗 2026/05/28）·昨日 <b style={{color:"#fde68a"}}>{YESTERDAY_PE}x</b>
            　·　玩股網 24倍上限帶（極端線）≈ <b style={{color:"#fb923c"}}>{(24*currentEPS).toLocaleString()}</b> 點
            　·　當前指數超出 24x 帶 <b style={{color:"#f87171"}}>{((CURRENT_IDX/(24*currentEPS)-1)*100).toFixed(1)}%</b>
          </div>
        </div>
        <div style={{marginLeft:"auto",fontFamily:"monospace",fontSize:22,fontWeight:800,color:"#fff"}}>
          {CURRENT_PE}x
        </div>
      </div>

      {/* ── HEADER KPI ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:14}}>
        {[
          {l:"TAIEX",    v:CURRENT_IDX.toLocaleString(), s:"2026/05/28", c:"#38bdf8"},
          {l:"PE (今)",   v:CURRENT_PE+"x",              s:"財報狗",      c:"#ef4444"},
          {l:"PE (昨)",   v:YESTERDAY_PE+"x",            s:"昨日",        c:"#f87171"},
          {l:"股淨比",    v:"4.32倍",                    s:"財報狗",      c:"#f97316"},
          {l:"EPS基數",   v:currentEPS.toLocaleString(), s:"指數÷PE",     c:"#a3e635"},
          {l:"24x上限帶", v:(24*currentEPS).toLocaleString(), s:"≈玩股極端線", c:"#facc15"},
        ].map((c,i)=>(
          <div key={i} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:9,padding:"10px 11px"}}>
            <div style={{fontSize:10,color:"#64748b",marginBottom:2}}>{c.l}</div>
            <div style={{fontSize:15,fontWeight:700,color:c.c,fontFamily:"monospace",lineHeight:1}}>{c.v}</div>
            <div style={{fontSize:10,color:"#334155",marginTop:2}}>{c.s}</div>
          </div>
        ))}
      </div>

      {/* ── VIEW TABS ── */}
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        {[["river","🌊 本益比河流圖"],["sigma","📐 標準差分析"]].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)} style={{
            padding:"6px 16px",borderRadius:8,border:"1px solid",
            borderColor:view===k?"#38bdf8":"#1e293b",
            background:view===k?"#38bdf822":"transparent",
            color:view===k?"#38bdf8":"#64748b",
            fontFamily:"'Syne',sans-serif",fontSize:12,fontWeight:600,cursor:"pointer",
          }}>{l}</button>
        ))}
        <div style={{marginLeft:"auto",fontSize:11,color:"#475569",display:"flex",alignItems:"center",gap:6}}>
          <label style={{cursor:"pointer"}}>
            <input type="checkbox" checked={showOut} onChange={e=>setShowOut(e.target.checked)} style={{marginRight:4,accentColor:"#f87171"}}/>
            含異常值(1989/2001/2009)
          </label>
        </div>
      </div>

      {/* ══════════════════ 河流圖 ══════════════════ */}
      {view==="river" && (
        <>
          {/* Range selector */}
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            {[["3y","近3年"],["5y","近5年"],["7y","近7年"]].map(([k,l])=>(
              <button key={k} onClick={()=>setRiverRange(k)} style={{
                padding:"4px 12px",borderRadius:7,border:"1px solid",
                borderColor:riverRange===k?"#38bdf8":"#1e293b",
                background:riverRange===k?"#38bdf822":"transparent",
                color:riverRange===k?"#38bdf8":"#64748b",
                fontFamily:"'Syne',sans-serif",fontSize:11,fontWeight:600,cursor:"pointer",
              }}>{l}</button>
            ))}
            <span style={{fontSize:11,color:"#475569",marginLeft:8,alignSelf:"center"}}>
              帶線 = 各PE倍數 × EPS基數（隨盈餘動態變化）
            </span>
          </div>

          <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:12,padding:"14px 6px 6px 0",marginBottom:16}}>
            <div style={{paddingLeft:14,marginBottom:8,fontSize:12,color:"#94a3b8"}}>
              TAIEX 指數 vs PE倍數帶（河流圖）
              <span style={{marginLeft:10,fontSize:10,color:"#334155"}}>來源: 玩股網月度數據 + 財報狗當前值</span>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={riverData} margin={{top:8,right:22,bottom:0,left:0}}>
                <defs>
                  {BANDS.map(b=>(
                    <linearGradient key={b} id={`bg${b}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BAND_LABEL_COLORS[b]} stopOpacity={0.06}/>
                      <stop offset="100%" stopColor={BAND_LABEL_COLORS[b]} stopOpacity={0.01}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false}/>
                <XAxis dataKey="label" tick={{fill:"#475569",fontSize:9}} axisLine={false} tickLine={false}
                  interval={riverRange==="3y"?2:4}/>
                <YAxis domain={[0,yMax]} tick={{fill:"#475569",fontSize:9,fontFamily:"monospace"}}
                  axisLine={false} tickLine={false} width={48}
                  tickFormatter={v=>v>=1000?(v/1000).toFixed(0)+"K":v}/>
                <Tooltip content={<RiverTooltip/>}/>

                {/* PE band lines (from bottom to top) */}
                {BANDS.map(b=>(
                  <Line key={b} dataKey={`b${b}`} type="monotone"
                    stroke={BAND_LABEL_COLORS[b]} strokeWidth={1} dot={false}
                    strokeDasharray={b<=16?"6 3":"none"} opacity={0.7}/>
                ))}

                {/* Band fill areas between consecutive bands */}
                {[
                  ["b8","b12","#22c55e"],["b12","b16","#84cc16"],
                  ["b16","b20","#eab308"],["b20","b24","#f97316"],
                  ["b24","b28","#ef4444"],["b28","b32","#dc2626"],
                  ["b32","b36","#7f1d1d"],
                ].map(([lo,hi,col])=>(
                  <Area key={lo+hi} dataKey={hi} type="monotone" fill={col+"18"}
                    stroke="none" stackId={null}/>
                ))}

                {/* TAIEX main line */}
                <Line dataKey="idx" type="monotone" stroke="#fff" strokeWidth={2.5} dot={false}
                  activeDot={{r:5,fill:"#f97316"}}
                  dot={d => {
                    if(!d.payload.isCurrent) return <g key={d.index}/>;
                    return <circle key={d.index} cx={d.cx} cy={d.cy} r={7}
                      fill="#f97316" stroke="#fff" strokeWidth={2}/>;
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div style={{display:"flex",flexWrap:"wrap",gap:8,paddingLeft:52,marginTop:8}}>
              {BANDS.map(b=>(
                <div key={b} style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:BAND_LABEL_COLORS[b]}}>
                  <div style={{width:14,height:2,background:BAND_LABEL_COLORS[b],borderRadius:2}}/>
                  {b}倍
                </div>
              ))}
              <div style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:"#fff"}}>
                <div style={{width:14,height:3,background:"#fff",borderRadius:2}}/>TAIEX
              </div>
              <div style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:"#f97316"}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:"#f97316"}}/>當前
              </div>
            </div>
          </div>

          {/* Current position bar */}
          <div style={{background:"#0a0f1e",border:"1px solid #7f1d1d",borderRadius:10,padding:"12px 16px",marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:600,color:"#fca5a5",marginBottom:10}}>當前 TAIEX 所在帶位</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {BANDS.map(b=>{
                const level = b*currentEPS;
                const isAbove = CURRENT_IDX >= level;
                const isActive = CURRENT_IDX >= level && CURRENT_IDX < (b+4)*currentEPS;
                return (
                  <div key={b} style={{
                    padding:"6px 10px",borderRadius:7,
                    background: isActive?"#7f1d1d":isAbove?"#1e2433":"#0f172a",
                    border:`1px solid ${isActive?"#ef4444":isAbove?"#334155":"#1e293b"}`,
                    minWidth:80,
                  }}>
                    <div style={{fontSize:10,color:BAND_LABEL_COLORS[b],fontWeight:600}}>{b}x 帶</div>
                    <div style={{fontSize:11,color:"#94a3b8",fontFamily:"monospace"}}>{level.toLocaleString()}</div>
                    <div style={{fontSize:10,color:isAbove?"#22c55e":"#475569"}}>
                      {isActive?"← 在此帶 ":isAbove?"✓ 已超過":"— 以下"}
                    </div>
                  </div>
                );
              })}
              <div style={{padding:"6px 10px",borderRadius:7,background:"#450a3a",border:"1px solid #d946ef",minWidth:80}}>
                <div style={{fontSize:10,color:"#e879f9",fontWeight:600}}>現在位置</div>
                <div style={{fontSize:11,color:"#e2e8f0",fontFamily:"monospace"}}>{CURRENT_IDX.toLocaleString()}</div>
                <div style={{fontSize:10,color:"#e879f9"}}>{CURRENT_PE}x ← 超歷史帶</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════ σ 分析 ══════════════════ */}
      {view==="sigma" && (
        <>
          {/* Period tabs */}
          <div style={{display:"flex",gap:6,marginBottom:14}}>
            {PERIODS.map(p=>(
              <button key={p.key} onClick={()=>setPeriod(p.key)} style={{
                padding:"4px 12px",borderRadius:7,border:"1px solid",
                borderColor:period===p.key?p.color:"#1e293b",
                background:period===p.key?`${p.color}22`:"transparent",
                color:period===p.key?p.color:"#64748b",
                fontFamily:"'Syne',sans-serif",fontSize:12,fontWeight:600,cursor:"pointer",
              }}>近{p.label}</button>
            ))}
          </div>

          {/* KPI mini cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:14}}>
            {[
              {l:"當前PE",    v:CURRENT_PE+"x",                       s:"2026/05",   c:"#ef4444"},
              {l:`${periodCfg.label}均值`, v:mean.toFixed(2)+"x",    s:`n=${n}`,    c:periodCfg.color},
              {l:"標準差",    v:std.toFixed(2)+"x",                   s:"1σ",        c:"#94a3b8"},
              {l:"Z-score",   v:(z>0?"+":"")+z.toFixed(2)+"σ",       s:Math.abs(z)>=3?"極端高估":Math.abs(z)>=2?"顯著高估":"偏高",
               c:zColor(z)},
              {l:"+1σ",       v:(mean+std).toFixed(1)+"x",            s:"偏高警示",  c:"#eab308"},
              {l:"+2σ",       v:(mean+2*std).toFixed(1)+"x",          s:"極端警戒",  c:"#ef4444"},
            ].map((c,i)=>(
              <div key={i} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:9,padding:"10px 11px"}}>
                <div style={{fontSize:10,color:"#64748b",marginBottom:2}}>{c.l}</div>
                <div style={{fontSize:15,fontWeight:700,color:c.c,fontFamily:"monospace",lineHeight:1}}>{c.v}</div>
                <div style={{fontSize:10,color:"#334155",marginTop:2}}>{c.s}</div>
              </div>
            ))}
          </div>

          {/* PE scalar chart */}
          <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:12,padding:"14px 6px 6px 0",marginBottom:16}}>
            <div style={{paddingLeft:14,marginBottom:8,fontSize:12,color:"#94a3b8"}}>
              本益比走勢 · 近{periodCfg.label}
              　均值 <b style={{color:periodCfg.color}}>{mean.toFixed(2)}x</b>
              　σ <b style={{color:"#94a3b8"}}>{std.toFixed(2)}x</b>
              <span style={{fontSize:10,color:"#334155",marginLeft:8}}>年底值，TWSE/Goodinfo/玩股網</span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={sigmaData} margin={{top:8,right:18,bottom:0,left:0}}>
                <defs>
                  <linearGradient id="peGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.2}/>
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false}/>
                <XAxis dataKey="year" tick={{fill:"#475569",fontSize:10}} axisLine={false} tickLine={false}
                  interval={period==="40y"?4:period==="20y"?2:1}/>
                <YAxis domain={[0,yDomainPE[1]]} tick={{fill:"#475569",fontSize:10,fontFamily:"monospace"}}
                  axisLine={false} tickLine={false} width={34} tickFormatter={v=>v.toFixed(0)+"x"}/>
                <Tooltip content={({active,payload,label})=>{
                  if(!active||!payload?.length) return null;
                  const row=payload[0]?.payload;
                  return (
                    <div style={{background:"#0f172a",border:"1px solid #334155",borderRadius:8,padding:"10px 14px"}}>
                      <div style={{color:"#94a3b8",fontSize:11,marginBottom:3}}>{label}年</div>
                      <div style={{color:"#38bdf8",fontSize:16,fontWeight:700,fontFamily:"monospace"}}>{row?.pe}x</div>
                      {row?.outlier&&<div style={{color:"#f87171",fontSize:10}}>⚠ 異常值</div>}
                      {row?.isCurrent&&<div style={{color:"#f97316",fontSize:10}}>● 當前</div>}
                    </div>
                  );
                }}/>
                {[
                  [mean+3*std,"#dc2626","+3σ","insideTopRight"],
                  [mean+2*std,"#ef4444","+2σ","insideTopRight"],
                  [mean+std,  "#eab308","+1σ","insideTopRight"],
                  [mean,      periodCfg.color,`均 ${mean.toFixed(1)}x`,"insideTopLeft"],
                  [mean-std,  "#eab308","-1σ","insideBottomRight"],
                  [mean-2*std,"#22c55e","-2σ","insideBottomRight"],
                ].filter(([y])=>y>0&&y<yDomainPE[1]).map(([y,s,l,pos])=>(
                  <ReferenceLine key={l} y={y} stroke={s} strokeDasharray={l.includes("均")?"":"5 3"}
                    strokeWidth={l.includes("均")?2:1}
                    label={{value:l,fill:s,fontSize:10,position:pos}}/>
                ))}
                <Area dataKey="pe" type="monotone" stroke="#38bdf8" strokeWidth={2}
                  fill="url(#peGrad)"
                  dot={d=>{
                    const isCur=d.payload.isCurrent;
                    const isOut=d.payload.outlier;
                    if(!d.payload.pe) return <g key={d.index}/>;
                    return <circle key={d.index} cx={d.cx} cy={d.cy}
                      r={isCur?7:isOut?5:2.5}
                      fill={isCur?"#f97316":isOut?"#f87171":"#38bdf8"} stroke="none"/>;
                  }}
                  activeDot={{r:6,fill:"#f97316"}}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Sigma table */}
          <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:12,overflow:"hidden",marginBottom:16}}>
            <div style={{padding:"11px 14px",borderBottom:"1px solid #1e293b"}}>
              <span style={{fontSize:13,fontWeight:600}}>五段時間 σ 分析</span>
              <span style={{fontSize:11,color:"#475569",marginLeft:8}}>
                當前 {CURRENT_PE}x · {showOut?"含異常值":"排除盈餘崩潰異常值"}
              </span>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"#0f172a"}}>
                    {["時間段","n","均值","σ","-2σ","-1σ","均值","+1σ","+2σ","+3σ","Z-score"].map(h=>(
                      <th key={h} style={{padding:"6px 9px",textAlign:"right",color:"#64748b",fontWeight:500,borderBottom:"1px solid #1e293b",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map(r=>{
                    const a=Math.abs(r.z);
                    const zc=zColor(r.z);
                    return (
                      <tr key={r.key} style={{borderBottom:"1px solid #0f172a",background:period===r.key?`${r.color}11`:"transparent"}}>
                        <td style={{padding:"7px 9px",textAlign:"left"}}>
                          <span style={{color:r.color,fontWeight:600}}>近{r.label}</span>
                          <span style={{color:"#334155",fontSize:10,marginLeft:4}}>({r.startYear}~)</span>
                        </td>
                        <td style={{padding:"7px 9px",textAlign:"right",color:"#94a3b8",fontFamily:"monospace"}}>{r.n}</td>
                        <td style={{padding:"7px 9px",textAlign:"right",color:r.color,fontFamily:"monospace",fontWeight:700}}>{r.mean.toFixed(2)}x</td>
                        <td style={{padding:"7px 9px",textAlign:"right",color:"#94a3b8",fontFamily:"monospace"}}>{r.std.toFixed(2)}</td>
                        {[-2,-1,0,1,2,3].map(k=>{
                          const v = k===0?r.mean:r.mean+k*r.std;
                          return (
                            <td key={k} style={{padding:"7px 9px",textAlign:"right",fontFamily:"monospace",
                              color:k>=2?"#ef4444":k===1?"#eab308":"#e2e8f0"}}>
                              {v.toFixed(1)}x
                            </td>
                          );
                        })}
                        <td style={{padding:"7px 9px",textAlign:"right"}}>
                          <span style={{color:zc,fontFamily:"monospace",fontWeight:700}}>
                            +{r.z.toFixed(2)}σ
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── 結論 ── */}
      <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:12,padding:14}}>
        <div style={{fontSize:12,fontWeight:600,marginBottom:10,color:"#94a3b8"}}>📋 綜合判讀</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:9}}>
          {[
            {t:"河流圖位置：超出全部帶線",c:"#ef4444",i:"🔴",
             b:`玩股網河流圖最高帶為 24x，對應目前約 ${(24*currentEPS).toLocaleString()} 點。TAIEX 43,636 已高出 24x 帶 ${((CURRENT_IDX/(24*currentEPS)-1)*100).toFixed(1)}%，進入圖表「帶外」未定義空間，屬歷史上首次。`},
            {t:"AI盈餘驅動 vs 估值泡沫",c:"#fb923c",i:"⚖️",
             b:"台積電2025年EPS年增逾40%，推動EPS基數從2022年~1,380提升至目前~1,331（注意2022年EPS基數更高，反映當時低估）。本波高PE是「指數漲速大於EPS成長速度」的結果。"},
            {t:"5年σ分析：+3.5σ以上",c:"#fca5a5",i:"📐",
             b:"近5年均值約16.8x，標準差約4.5x。當前32.79x換算約+3.5σ以上，已超過統計上0.05%的極端區間。近10年、20年分析亦呈現類似的極端高估訊號。"},
            {t:"歷史可比時期",c:"#e879f9",i:"📚",
             b:"1989年泡沫(52.7x)、2001年盈餘崩潰(38.9x)、2009年GFC(55.2x)是PE更高的時期，但皆為盈餘崩潰所致。本次32.79x是在盈餘正常甚至強勁情況下的純估值膨脹，性質不同。"},
          ].map((c,i)=>(
            <div key={i} style={{background:"#0f172a",borderRadius:8,padding:"11px 12px",borderLeft:`3px solid ${c.c}`}}>
              <div style={{fontSize:12,fontWeight:600,color:c.c,marginBottom:4}}>{c.i} {c.t}</div>
              <div style={{fontSize:11,color:"#64748b",lineHeight:1.7}}>{c.b}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:10,padding:"9px 12px",background:"#0f172a",borderRadius:8,border:"1px solid #1e293b",fontSize:11,color:"#475569",lineHeight:1.8}}>
          📌 <b style={{color:"#94a3b8"}}>資料來源：</b>月度本益比河流圖數據來自<b style={{color:"#38bdf8"}}>玩股網</b>（TWSE官方推計值）；
          當前大盤本益比 32.79x 及股淨比 4.32 來自<b style={{color:"#22c55e"}}>財報狗</b>（2026/05/28）；
          1986–2020年度數據來自 TWSE 年報/Goodinfo。
          <b style={{color:"#f87171"}}> 本圖僅供資訊參考，不構成投資建議。高估值可長期維持，投資人應自行評估風險。</b>
        </div>
      </div>
    </div>
  );
}