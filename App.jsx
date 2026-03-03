import { useState, useEffect, useCallback, useMemo } from "react"
import { supabase } from "./supabase.js"
import "./style.css"
// All files are in root directory (no src folder)

const PIN = "1234"
const SLOTS = ["09:00","10:30","12:00","13:30","15:00","16:30","18:00"]
const SUN_LAST = "15:00"
const OFF = [1, 3]
const DN = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"]
const DF = ["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"]
const MN = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"]

const dKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d }
const addD = (d,n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r }
const fmtD = d => `${d.getDate()} ${MN[d.getMonth()]}`
const endT = t => { const[h,m]=t.split(":").map(Number); const v=h*60+m+90; return`${Math.floor(v/60)}:${(v%60).toString().padStart(2,"0")}` }
const getSlots = d => { const w=d.getDay(); if(OFF.includes(w)) return []; return w===0 ? SLOTS.filter(t=>t<=SUN_LAST) : [...SLOTS] }
const genCode = () => { const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let r=""; for(let i=0;i<4;i++) r+=c[~~(Math.random()*c.length)]; return r }

// ─── DB helpers ───
async function dbLoadStudents() {
  const { data } = await supabase.from("students").select("*").order("created_at")
  return (data || []).map(s => ({ id: s.id, name: s.name, phone: s.phone || "", code: s.code, total: s.total_lessons, completed: s.completed_lessons }))
}

async function dbLoadBookings() {
  const { data } = await supabase.from("bookings").select("*")
  const obj = {}
  ;(data || []).forEach(b => { obj[`${b.date}_${b.time_slot}`] = b.student_id })
  return obj
}

async function dbLoadBlocked() {
  const { data } = await supabase.from("blocked_slots").select("*")
  const obj = {}
  ;(data || []).forEach(b => { obj[`${b.date}_${b.time_slot}`] = true })
  return obj
}

async function dbAddStudent(s) {
  await supabase.from("students").insert({ id: s.id, name: s.name, phone: s.phone, code: s.code, total_lessons: s.total, completed_lessons: s.completed })
}

async function dbUpdateStudent(s) {
  await supabase.from("students").update({ name: s.name, phone: s.phone, total_lessons: s.total, completed_lessons: s.completed }).eq("id", s.id)
}

async function dbDeleteStudent(id) {
  await supabase.from("students").delete().eq("id", id)
}

async function dbAddBooking(date, time, studentId) {
  await supabase.from("bookings").insert({ date, time_slot: time, student_id: studentId })
}

async function dbRemoveBooking(date, time) {
  await supabase.from("bookings").delete().eq("date", date).eq("time_slot", time)
}

async function dbAddBlocked(date, time) {
  await supabase.from("blocked_slots").upsert({ date, time_slot: time })
}

async function dbRemoveBlocked(date, time) {
  await supabase.from("blocked_slots").delete().eq("date", date).eq("time_slot", time)
}

// ─── Icon ───
const Ic = ({t, s=20}) => {
  const st = {width:s,height:s,fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"}
  const P = {
    lk:<><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>,
    ul:<><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></>,
    pl:<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    x:<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    ok:<><polyline points="20 6 9 17 4 12"/></>,
    lt:<><polyline points="15 18 9 12 15 6"/></>,
    rt:<><polyline points="9 18 15 12 9 6"/></>,
    bk:<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    bn:<><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>,
  }
  return <svg viewBox="0 0 24 24" style={st}>{P[t]}</svg>
}

// ─── Week Schedule ───
function Week({ bk, bl, sts, onS, isA, sd, setSd }) {
  const [ws, setWs] = useState(() => {
    const d = today(); const w = d.getDay(); d.setDate(d.getDate() - (w === 0 ? 6 : w - 1)); return d
  })
  const days = useMemo(() => Array.from({length:7}, (_,i) => addD(ws, i)), [ws])
  const s = sd || today()
  const sls = getSlots(s)
  const d = dKey(s)

  return <div>
    <div className="wn">
      <button onClick={() => setWs(addD(ws,-7))}><Ic t="lt"/></button>
      <span>{fmtD(days[0])} — {fmtD(days[6])}</span>
      <button onClick={() => setWs(addD(ws,7))}><Ic t="rt"/></button>
    </div>
    <div className="dt">
      {days.map((dy,i) => {
        const of = OFF.includes(dy.getDay())
        const isT = dKey(dy) === dKey(today())
        const isS = dKey(dy) === dKey(s)
        return <button key={i} className={`db${isS?" ac":""}${of?" of":""}${isT&&!isS?" td":""}`} onClick={() => !of && setSd(dy)} disabled={of}>
          <span style={{fontSize:10,textTransform:"uppercase"}}>{DN[dy.getDay()]}</span>
          <span className="dn">{dy.getDate()}</span>
        </button>
      })}
    </div>
    {OFF.includes(s.getDay()) ? <div className="em"><div className="ic">😴</div><p>Выходной</p></div>
    : <div>
      {isA && <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
        <button className="b bg bs" onClick={() => onS("bd",d,sls)}><Ic t="bn" s={14}/> День</button>
      </div>}
      {sls.map(t => {
        const k = `${d}_${t}`
        const bo = !!bk[k], bx = !!bl[k]
        const su = bo ? sts.find(x => x.id === bk[k]) : null
        return <div key={t} className={`sl${bo?" bk":""}${bx?" bl":""}`} onClick={() => !bx && onS(bo?"i":"b",d,t,su)}>
          <div className="st">{t}</div>
          <div className="si">
            {bx ? <><div className="sn" style={{color:"#64748b"}}>Закрыто</div><div className="ss">Недоступно</div></>
            : bo ? <><div className="sn">{su?.name||"?"}</div><div className="ss">{t}–{endT(t)}</div></>
            : <><div className="sn" style={{color:"#10b981"}}>Свободно</div><div className="ss">{t}–{endT(t)}</div></>}
          </div>
          {isA && bx && <button className="b bg bs" onClick={e => {e.stopPropagation(); onS("ub",d,t)}} style={{color:"#2563eb"}}><Ic t="ul" s={16}/></button>}
          {isA && !bx && !bo && <button className="b bg bs" onClick={e => {e.stopPropagation(); onS("bl",d,t)}} style={{color:"#94a3b8"}}><Ic t="lk" s={16}/></button>}
          {isA && bo && <button className="b bg bs" onClick={e => {e.stopPropagation(); onS("c",d,t)}} style={{color:"#ef4444"}}><Ic t="x" s={16}/></button>}
        </div>
      })}
    </div>}
  </div>
}

// ─── Login ───
function Login({ onA, onSt, sts }) {
  const [m, sM] = useState(null)
  const [pin, sP] = useState(["","","",""])
  const [er, sE] = useState(false)
  const [cd, sC] = useState("")

  const hPin = (i, v) => {
    if (v.length > 1) return
    const n = [...pin]; n[i] = v; sP(n); sE(false)
    if (v && i < 3) document.getElementById(`p${i+1}`)?.focus()
    if (i === 3 && v) {
      if (n.join("") === PIN) onA()
      else { sE(true); sP(["","","",""]); setTimeout(() => document.getElementById("p0")?.focus(), 100) }
    }
  }

  const hSt = () => {
    const s = sts.find(x => x.code === cd.trim().toUpperCase())
    if (s) onSt(s); else sE(true)
  }

  if (!m) return <div>
    <div className="hd" style={{textAlign:"center",paddingTop:48,paddingBottom:32}}>
      <div style={{fontSize:48,marginBottom:8}}>🚗</div><h1>Автошкола</h1><p>Запись на вождение</p>
    </div>
    <div className="ct" style={{marginTop:8}}>
      <button className="b bp bf" style={{padding:16,fontSize:16,marginBottom:10}} onClick={() => sM("s")}>🎓 Я ученик</button>
      <button className="b bo bf" style={{padding:16,fontSize:16}} onClick={() => sM("a")}>⚙️ Инструктор</button>
    </div>
  </div>

  if (m === "a") return <div>
    <div className="hd"><h1>Вход инструктора</h1><p>PIN-код</p><div className="ha"><button className="hb" onClick={() => {sM(null);sP(["","","",""]);sE(false)}}><Ic t="bk"/></button></div></div>
    <div className="ct"><div className="cd" style={{textAlign:"center"}}>
      <div className="pi">{pin.map((d,i) => <input key={i} id={`p${i}`} className="pd" type="password" inputMode="numeric" maxLength={1} value={d} onChange={e => hPin(i,e.target.value)} style={er?{borderColor:"#ef4444"}:{}} autoFocus={i===0}/>)}</div>
      {er && <p style={{color:"#ef4444",fontSize:13,fontWeight:600}}>Неверный PIN</p>}
      <p style={{fontSize:12,color:"#64748b",marginTop:12}}>PIN: 1234</p>
    </div></div>
  </div>

  return <div>
    <div className="hd"><h1>Вход ученика</h1><p>Введите код</p><div className="ha"><button className="hb" onClick={() => {sM(null);sE(false);sC("")}}><Ic t="bk"/></button></div></div>
    <div className="ct"><div className="cd">
      <label style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block"}}>Код ученика</label>
      <input className="ip" placeholder="Например: AB12" value={cd} onChange={e => {sC(e.target.value.toUpperCase());sE(false)}} style={er?{borderColor:"#ef4444"}:{}}/>
      {er && <p style={{color:"#ef4444",fontSize:13,fontWeight:600,marginTop:6}}>Не найден</p>}
      <button className="b bp bf" style={{marginTop:12}} onClick={hSt} disabled={!cd.trim()}>Войти</button>
      <p style={{fontSize:12,color:"#64748b",marginTop:12,textAlign:"center"}}>Код выдаёт инструктор</p>
    </div></div>
  </div>
}

// ─── Admin ───
function Admin({ sts, setSts, bk, bl, aB, rB, tB, bD, onL, toast }) {
  const [tab, sT] = useState("s")
  const [ml, sM] = useState(null)
  const [sd, setSd] = useState(today())
  const [nm, sNm] = useState("")
  const [ph, sPh] = useState("")
  const [tot, sTot] = useState("25")
  const [ss, sSs] = useState(null)
  const [ed, sEd] = useState(null)

  const addSt = async () => {
    if (!nm.trim()) return
    const s = { id: crypto.randomUUID(), name: nm.trim(), phone: ph.trim(), code: genCode(), total: parseInt(tot)||25, completed: 0 }
    setSts(p => [...p, s])
    await dbAddStudent(s)
    sNm(""); sPh(""); sTot("25"); sM(null)
    toast(`${s.name} добавлен! Код: ${s.code}`)
  }

  const delSt = async (id) => {
    setSts(p => p.filter(s => s.id !== id))
    await dbDeleteStudent(id)
    toast("Удалён"); sM(null)
  }

  const updSt = async () => {
    if (!ed) return
    setSts(p => p.map(s => s.id === ed.id ? ed : s))
    await dbUpdateStudent(ed)
    toast("Сохранено"); sEd(null); sM(null)
  }

  const onSl = (a, d, t, su) => {
    if (a === "bl") tB(d, t)
    else if (a === "ub") tB(d, t)
    else if (a === "bd") bD(d, t)
    else if (a === "c") rB(d, t)
    else if (a === "b") { sM({t:"bk",d,tm:t}); sSs(null) }
    else if (a === "i") sM({t:"in",d,tm:t,su})
  }

  const cB = () => { if (!ss || !ml) return; aB(ml.d, ml.tm, ss); sM(null) }
  const tc = useMemo(() => Object.keys(bk).filter(k => k.startsWith(dKey(today()))).length, [bk])

  return <div>
    <div className="hd"><h1>Панель инструктора</h1><p>Расписание и ученики</p><div className="ha"><button className="hb" onClick={onL}><Ic t="bk"/></button></div></div>
    <div className="ct">
      <div className="sc"><div className="sk"><div className="n">{tc}</div><div className="l">Сегодня</div></div>
        <div className="sk"><div className="n">{sts.length}</div><div className="l">Учеников</div></div></div>
      <div className="tw"><button className={tab==="s"?"ac":""} onClick={() => sT("s")}>Расписание</button>
        <button className={tab==="u"?"ac":""} onClick={() => sT("u")}>Ученики</button></div>

      {tab === "s" && <Week bk={bk} bl={bl} sts={sts} onS={onSl} isA sd={sd} setSd={setSd}/>}
      {tab === "u" && <div>
        <button className="b bp bf" style={{marginBottom:12}} onClick={() => sM({t:"ad"})}><Ic t="pl" s={18}/> Добавить</button>
        {sts.length === 0 ? <div className="em"><div className="ic">👤</div><p>Нет учеников</p></div>
        : sts.map(s => <div key={s.id} className="sr" onClick={() => {sEd({...s}); sM({t:"ed"})}}>
          <div className="av">{s.name[0]}</div>
          <div className="ri"><div className="nm">{s.name}</div><div className="ph">{s.phone||"—"} · {s.code}</div></div>
          <div className="rs"><div className="cn">{s.completed||0}/{s.total||25}</div><div className="lb">занятий</div></div>
        </div>)}
      </div>}
    </div>

    {ml?.t === "ad" && <div className="mo" onClick={() => sM(null)}><div className="ml" onClick={e => e.stopPropagation()}>
      <h2>Новый ученик</h2>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <input className="ip" placeholder="Имя" value={nm} onChange={e => sNm(e.target.value)} autoFocus/>
        <input className="ip" placeholder="Телефон" value={ph} onChange={e => sPh(e.target.value)}/>
        <input className="ip" type="number" placeholder="Кол-во занятий" value={tot} onChange={e => sTot(e.target.value)}/>
        <button className="b bp bf" onClick={addSt} disabled={!nm.trim()}>Добавить</button>
      </div></div></div>}

    {ml?.t === "ed" && ed && <div className="mo" onClick={() => {sM(null);sEd(null)}}><div className="ml" onClick={e => e.stopPropagation()}>
      <h2>Редактировать</h2>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <input className="ip" value={ed.name} onChange={e => sEd({...ed,name:e.target.value})}/>
        <input className="ip" placeholder="Телефон" value={ed.phone} onChange={e => sEd({...ed,phone:e.target.value})}/>
        <input className="ip" type="number" placeholder="Всего" value={ed.total} onChange={e => sEd({...ed,total:parseInt(e.target.value)||0})}/>
        <input className="ip" type="number" placeholder="Проведено" value={ed.completed} onChange={e => sEd({...ed,completed:parseInt(e.target.value)||0})}/>
        <div className="lb">Код ученика: <strong>{ed.code}</strong></div>
        <button className="b bp bf" onClick={updSt}>Сохранить</button>
        <button className="b bd bf" onClick={() => {if(confirm("Удалить?")) delSt(ed.id)}}>Удалить</button>
      </div></div></div>}

    {ml?.t === "bk" && <div className="mo" onClick={() => sM(null)}><div className="ml" onClick={e => e.stopPropagation()}>
      <h2>Записать на {ml.tm}</h2>
      {sts.length === 0 ? <p style={{color:"#64748b",textAlign:"center",padding:20}}>Сначала добавьте учеников</p>
      : <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {sts.map(s => <div key={s.id} className="sr" style={{borderColor:ss===s.id?"#2563eb":undefined,background:ss===s.id?"#dbeafe":undefined}} onClick={() => sSs(s.id)}>
          <div className="av">{s.name[0]}</div>
          <div className="ri"><div className="nm">{s.name}</div><div className="ph">{s.completed||0}/{s.total||25}</div></div>
          {ss === s.id && <Ic t="ok"/>}
        </div>)}
        <button className="b bp bf" style={{marginTop:8}} onClick={cB} disabled={!ss}>Записать</button>
      </div>}</div></div>}

    {ml?.t === "in" && <div className="mo" onClick={() => sM(null)}><div className="ml" onClick={e => e.stopPropagation()}>
      <h2>{ml.tm}</h2>
      <div className="sr"><div className="av">{ml.su?.name?.[0]||"?"}</div><div className="ri"><div className="nm">{ml.su?.name||"?"}</div><div className="ph">{ml.su?.phone||""}</div></div></div>
      <button className="b bd bf" style={{marginTop:12}} onClick={() => {rB(ml.d,ml.tm);sM(null)}}>Отменить запись</button>
    </div></div>}
  </div>
}

// ─── Student View ───
function StudentView({ st, bk, bl, aB, rB, onB, toast }) {
  const [sd, setSd] = useState(today())
  const [cf, sCf] = useState(null)

  const mb = useMemo(() =>
    Object.entries(bk).filter(([,v]) => v === st.id)
      .map(([k]) => { const[d,t] = k.split("_"); return {d,t} })
      .sort((a,b) => a.d === b.d ? a.t.localeCompare(b.t) : a.d.localeCompare(b.d))
  , [bk, st.id])

  const onS = (a, d, t, su) => {
    if (a === "b") sCf({d,t})
    else if (a === "i" && bk[`${d}_${t}`] === st.id) {
      if (confirm("Отменить запись?")) rB(d, t)
    }
  }

  const pc = Math.round(((st.completed||0) / (st.total||25)) * 100)

  return <div>
    <div className="hd"><h1>Привет, {st.name}!</h1><p>{st.completed||0} из {st.total||25} занятий</p><div className="ha"><button className="hb" onClick={onB}><Ic t="bk"/></button></div></div>
    <div className="ct">
      <div className="pb"><div className="pf" style={{width:`${pc}%`}}/></div>
      {mb.length > 0 && <div className="cd">
        <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Мои записи</div>
        {mb.slice(0,5).map((b,i) => {
          const d = new Date(b.d.split("-")[0], b.d.split("-")[1]-1, b.d.split("-")[2])
          return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<Math.min(mb.length,5)-1?"1px solid #e2e8f0":"none"}}>
            <span style={{fontSize:13}}><strong>{DF[d.getDay()]}</strong>, {fmtD(d)}</span><span className="bdg">{b.t}</span>
          </div>
        })}
      </div>}
      <Week bk={bk} bl={bl} sts={[st]} onS={onS} isA={false} sd={sd} setSd={setSd}/>
    </div>
    {cf && <div className="mo" onClick={() => sCf(null)}><div className="ml" onClick={e => e.stopPropagation()}>
      <h2>Подтвердить?</h2>
      <div className="cf"><p>Записаться на <strong>{cf.t}</strong>, {fmtD(new Date(cf.d.split("-")[0], cf.d.split("-")[1]-1, cf.d.split("-")[2]))}?</p>
        <div className="ca"><button className="b bp" style={{flex:1}} onClick={() => {aB(cf.d,cf.t,st.id);sCf(null)}}>Да</button>
          <button className="b bo" style={{flex:1}} onClick={() => sCf(null)}>Нет</button></div></div>
    </div></div>}
  </div>
}

// ─── Main App ───
export default function App() {
  const [v, sV] = useState("l")
  const [sts, sSts] = useState([])
  const [bk, sBk] = useState({})
  const [bl, sBl] = useState({})
  const [cs, sCs] = useState(null)
  const [tt, sTt] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const [s, b, blocked] = await Promise.all([dbLoadStudents(), dbLoadBookings(), dbLoadBlocked()])
        sSts(s); sBk(b); sBl(blocked)
      } catch(e) { console.error("Load error", e) }
      sV("lg")
    })()
  }, [])

  const toast = useCallback(m => { sTt(m); setTimeout(() => sTt(null), 2500) }, [])

  const aB = useCallback(async (d, t, sid) => {
    const k = `${d}_${t}`
    sBk(p => { if(p[k]) return p; return {...p, [k]: sid} })
    sSts(p => p.map(s => s.id === sid ? {...s, completed: (s.completed||0)+1} : s))
    await dbAddBooking(d, t, sid)
    const st = sts.find(s => s.id === sid)
    if (st) await dbUpdateStudent({...st, completed: (st.completed||0)+1})
    toast("Записано!")
  }, [toast, sts])

  const rB = useCallback(async (d, t) => {
    const k = `${d}_${t}`
    const sid = bk[k]
    sBk(p => { const n = {...p}; delete n[k]; return n })
    if (sid) {
      sSts(p => p.map(s => s.id === sid ? {...s, completed: Math.max(0,(s.completed||0)-1)} : s))
      const st = sts.find(s => s.id === sid)
      if (st) await dbUpdateStudent({...st, completed: Math.max(0,(st.completed||0)-1)})
    }
    await dbRemoveBooking(d, t)
    toast("Отменено")
  }, [toast, sts, bk])

  const tB = useCallback(async (d, t) => {
    const k = `${d}_${t}`
    sBl(p => {
      const n = {...p}
      if (n[k]) { delete n[k]; dbRemoveBlocked(d, t); }
      else { n[k] = true; dbAddBlocked(d, t); }
      return n
    })
  }, [])

  const bD = useCallback(async (d, sls) => {
    sBl(p => {
      const n = {...p}
      const all = sls.every(t => n[`${d}_${t}`])
      sls.forEach(t => {
        const k = `${d}_${t}`
        if (all) { delete n[k]; dbRemoveBlocked(d, t) }
        else { n[k] = true; dbAddBlocked(d, t) }
      })
      return n
    })
    toast("Готово")
  }, [toast])

  if (v === "l") return <div className="app"><div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh"}}>
    <p style={{fontFamily:"Nunito,sans-serif",fontSize:18,color:"#64748b",fontWeight:700}}>Загрузка...</p></div></div>

  return <div className="app">
    {v === "lg" && <Login onA={() => sV("a")} onSt={s => {sCs(s); sV("sv")}} sts={sts}/>}
    {v === "a" && <Admin sts={sts} setSts={sSts} bk={bk} bl={bl} aB={aB} rB={rB} tB={tB} bD={bD} onL={() => sV("lg")} toast={toast}/>}
    {v === "sv" && cs && <StudentView st={cs} bk={bk} bl={bl} aB={aB} rB={rB} onB={() => sV("lg")} toast={toast}/>}
    {tt && <div className="tt">{tt}</div>}
  </div>
}
