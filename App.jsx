import { useState, useEffect, useCallback, useMemo } from "react"
import { supabase } from "./supabase.js"
import "./style.css"
// All files are in root directory (no src folder)

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

// ─── DB helpers: ИНСТРУКТОР (залогинен через Supabase Auth, RLS пускает) ───
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
  const { data: existing } = await supabase.from("bookings").select("student_id").eq("date", date).eq("time_slot", time).maybeSingle()
  if (existing) throw new Error("Слот уже занят")
  const { error } = await supabase.from("bookings").insert({ date, time_slot: time, student_id: studentId })
  if (error) throw new Error(error.message)
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

// ─── RPC helpers: УЧЕНИК (аноним, всё через серверные функции) ───
async function rpcStudentLogin(code) {
  const { data, error } = await supabase.rpc("student_login", { p_code: code })
  if (error || !data || !data.length) return null
  const s = data[0]
  return { id: s.id, name: s.name, phone: s.phone || "", code: code.trim().toUpperCase(), total: s.total_lessons, completed: s.completed_lessons }
}

async function rpcOccupancy() {
  const { data } = await supabase.rpc("occupancy")
  const bk = {}, bl = {}
  ;(data || []).forEach(r => { const k = `${r.date}_${r.time_slot}`; if (r.kind === "blocked") bl[k] = true; else bk[k] = true })
  return { bk, bl }
}

async function rpcMyBookings(code) {
  const { data } = await supabase.rpc("my_bookings", { p_code: code })
  const m = {}
  ;(data || []).forEach(r => { m[`${r.date}_${r.time_slot}`] = true })
  return m
}

async function rpcBook(code, date, time) {
  const { data, error } = await supabase.rpc("student_book", { p_code: code, p_date: date, p_time: time })
  if (error) throw new Error(error.message)
  return data
}

async function rpcCancel(code, date, time) {
  const { error } = await supabase.rpc("student_cancel", { p_code: code, p_date: date, p_time: time })
  if (error) throw new Error(error.message)
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
            : bo ? <><div className="sn">{su?.name||"Занято"}</div><div className="ss">{t}–{endT(t)}</div></>
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
function Login({ onA, onSt }) {
  const [m, sM] = useState(null)
  const [er, sE] = useState("")
  const [cd, sC] = useState("")
  const [email, sEmail] = useState("")
  const [pw, sPw] = useState("")
  const [busy, sB] = useState(false)

  const hInstr = async () => {
    if (!email.trim() || !pw) return
    sB(true); sE("")
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    sB(false)
    if (error) sE("Неверная почта или пароль")
    else onA()
  }

  const hSt = async () => {
    if (!cd.trim()) return
    sB(true); sE("")
    const s = await rpcStudentLogin(cd)
    sB(false)
    if (s) onSt(s); else sE("Код не найден")
  }

  if (!m) return <div>
    <div className="hd" style={{textAlign:"center",paddingTop:48,paddingBottom:32}}>
      <div style={{fontSize:48,marginBottom:8}}>🚗</div><h1>Автошкола</h1><p>Запись на вождение</p>
    </div>
    <div className="ct" style={{marginTop:8}}>
      <button className="b bp bf" style={{padding:16,fontSize:16,marginBottom:10}} onClick={() => {sE("");sM("s")}}>🎓 Я ученик</button>
      <button className="b bo bf" style={{padding:16,fontSize:16}} onClick={() => {sE("");sM("a")}}>⚙️ Инструктор</button>
    </div>
  </div>

  if (m === "a") return <div>
    <div className="hd"><h1>Вход инструктора</h1><p>Почта и пароль</p><div className="ha"><button className="hb" onClick={() => {sM(null);sE("");sEmail("");sPw("")}}><Ic t="bk"/></button></div></div>
    <div className="ct"><div className="cd">
      <label style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block"}}>Почта</label>
      <input className="ip" type="email" autoComplete="username" placeholder="you@example.com" value={email} onChange={e => {sEmail(e.target.value);sE("")}}/>
      <label style={{fontSize:13,fontWeight:700,margin:"12px 0 6px",display:"block"}}>Пароль</label>
      <input className="ip" type="password" autoComplete="current-password" placeholder="Пароль" value={pw} onChange={e => {sPw(e.target.value);sE("")}} onKeyDown={e => e.key==="Enter"&&hInstr()}/>
      {er && <p style={{color:"#ef4444",fontSize:13,fontWeight:600,marginTop:6}}>{er}</p>}
      <button className="b bp bf" style={{marginTop:12}} onClick={hInstr} disabled={busy||!email.trim()||!pw}>{busy?"Вход…":"Войти"}</button>
    </div></div>
  </div>

  return <div>
    <div className="hd"><h1>Вход ученика</h1><p>Введите код</p><div className="ha"><button className="hb" onClick={() => {sM(null);sE("");sC("")}}><Ic t="bk"/></button></div></div>
    <div className="ct"><div className="cd">
      <label style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block"}}>Код ученика</label>
      <input className="ip" placeholder="Например: AB12" value={cd} onChange={e => {sC(e.target.value.toUpperCase());sE("")}} onKeyDown={e => e.key==="Enter"&&hSt()} style={er?{borderColor:"#ef4444"}:{}}/>
      {er && <p style={{color:"#ef4444",fontSize:13,fontWeight:600,marginTop:6}}>{er}</p>}
      <button className="b bp bf" style={{marginTop:12}} onClick={hSt} disabled={busy||!cd.trim()}>{busy?"Вход…":"Войти"}</button>
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
  const td = dKey(today())
  const tc = useMemo(() => Object.keys(bk).filter(k => k.startsWith(td)).length, [bk, td])
  // Откатано = записи в прошлом (сегодняшнее занятие ещё не завершено)
  const doneBy = useMemo(() => {
    const m = {}
    Object.entries(bk).forEach(([k, sid]) => { if (k.split("_")[0] < td) m[sid] = (m[sid] || 0) + 1 })
    return m
  }, [bk, td])

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
        : sts.map(s => { const done = doneBy[s.id]||0; return <div key={s.id} className="sr" onClick={() => {sEd({...s}); sM({t:"ed"})}}>
          <div className="av">{s.name[0]}</div>
          <div className="ri"><div className="nm">{s.name}</div><div className="ph">{s.phone||"—"} · {s.code}</div></div>
          <div className="rs"><div className="cn">{done}/{s.total||25}</div><div className="lb">занятий</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>Осталось: {Math.max(0, (s.total||25)-done)}</div></div>
        </div>})}
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
          <div className="ri"><div className="nm">{s.name}</div><div className="ph">{doneBy[s.id]||0}/{s.total||25}</div></div>
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

// ─── Student View (данные только через RPC) ───
function StudentView({ st, onB, toast }) {
  const [sd, setSd] = useState(today())
  const [cf, sCf] = useState(null)
  const [bk, sBk] = useState({})
  const [bl, sBl] = useState({})

  const load = useCallback(async () => {
    try {
      const [occ, mine] = await Promise.all([rpcOccupancy(), rpcMyBookings(st.code)])
      const bkMap = {}
      Object.keys(occ.bk).forEach(k => { bkMap[k] = "x" })   // занято кем-то
      Object.keys(mine).forEach(k => { bkMap[k] = st.id })    // моя запись
      sBk(bkMap); sBl(occ.bl)
    } catch(e) { console.error("Student load error", e) }
  }, [st.code, st.id])

  useEffect(() => {
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [load])

  const aB = async (d, t) => {
    try {
      const r = await rpcBook(st.code, d, t)
      if (r === "ok") toast("Записано!")
      else if (r === "taken") toast("Слот уже занят")
      else if (r === "blocked") toast("Слот недоступен")
      else toast("Не удалось записаться")
    } catch(e) { toast("Ошибка записи") }
    load()
  }

  const rB = async (d, t) => {
    try { await rpcCancel(st.code, d, t); toast("Отменено") }
    catch(e) { toast("Ошибка") }
    load()
  }

  const mb = useMemo(() =>
    Object.entries(bk).filter(([,v]) => v === st.id)
      .map(([k]) => { const[d,t] = k.split("_"); return {d,t} })
      .sort((a,b) => a.d === b.d ? a.t.localeCompare(b.t) : a.d.localeCompare(b.d))
  , [bk, st.id])

  const onS = (a, d, t) => {
    if (a === "b") sCf({d,t})
    else if (a === "i" && bk[`${d}_${t}`] === st.id) {
      if (confirm("Отменить запись?")) rB(d, t)
    }
  }

  const td = dKey(today())
  const upcoming = mb.filter(b => b.d >= td)
  const past = mb.filter(b => b.d < td)
  const done = past.length          // откатано = прошедшие записи
  const pc = Math.round((done / (st.total||25)) * 100)
  const remaining = Math.max(0, (st.total||25) - done)

  return <div>
    <div className="hd"><h1>Привет, {st.name}!</h1><p>{done} из {st.total||25} занятий · Осталось: {remaining}</p><div className="ha"><button className="hb" onClick={onB}><Ic t="bk"/></button></div></div>
    <div className="ct">
      <div className="pb"><div className="pf" style={{width:`${pc}%`}}/></div>
      {mb.length > 0 && <div className="cd">
        <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Мои записи</div>
        {upcoming.length > 0 && <>
          <div style={{fontSize:11,color:"#2563eb",fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Предстоящие</div>
          {upcoming.map((b,i) => {
            const d = new Date(b.d.split("-")[0], b.d.split("-")[1]-1, b.d.split("-")[2])
            return <div key={b.d+b.t} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<upcoming.length-1?"1px solid #e2e8f0":"none"}}>
              <span style={{fontSize:13}}><strong>{DF[d.getDay()]}</strong>, {fmtD(d)}</span><span className="bdg">{b.t}</span>
            </div>
          })}
        </>}
        {past.length > 0 && <>
          <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginTop:10,marginBottom:6,textTransform:"uppercase"}}>Прошедшие</div>
          {past.map((b,i) => {
            const d = new Date(b.d.split("-")[0], b.d.split("-")[1]-1, b.d.split("-")[2])
            return <div key={b.d+b.t} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<past.length-1?"1px solid #e2e8f0":"none"}}>
              <span style={{fontSize:13}}><strong>{DF[d.getDay()]}</strong>, {fmtD(d)}</span><span className="bdg" style={{opacity:0.6}}>{b.t}</span>
            </div>
          })}
        </>}
      </div>}
      <Week bk={bk} bl={bl} sts={[st]} onS={onS} isA={false} sd={sd} setSd={setSd}/>
    </div>
    {cf && <div className="mo" onClick={() => sCf(null)}><div className="ml" onClick={e => e.stopPropagation()}>
      <h2>Подтвердить?</h2>
      <div className="cf"><p>Записаться на <strong>{cf.t}</strong>, {fmtD(new Date(cf.d.split("-")[0], cf.d.split("-")[1]-1, cf.d.split("-")[2]))}?</p>
        <div className="ca"><button className="b bp" style={{flex:1}} onClick={() => {aB(cf.d,cf.t);sCf(null)}}>Да</button>
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

  const toast = useCallback(m => { sTt(m); setTimeout(() => sTt(null), 2500) }, [])

  // Восстановить сессию инструктора или показать вход
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession()
      sV(data?.session ? "a" : "lg")
    })()
  }, [])

  // Загрузка данных инструктора + опрос раз в 30 сек (пока открыта панель)
  const loadInstr = useCallback(async () => {
    try {
      const [s, b, blocked] = await Promise.all([dbLoadStudents(), dbLoadBookings(), dbLoadBlocked()])
      sSts(s); sBk(b); sBl(blocked)
    } catch(e) { console.error("Load error", e) }
  }, [])

  useEffect(() => {
    if (v !== "a") return
    loadInstr()
    const iv = setInterval(loadInstr, 30000)
    return () => clearInterval(iv)
  }, [v, loadInstr])

  // Handlers инструктора (прямая запись, RLS пускает залогиненного)
  const aB = useCallback(async (d, t, sid) => {
    const k = `${d}_${t}`
    try {
      await dbAddBooking(d, t, sid)
      sBk(p => { if(p[k]) return p; return {...p, [k]: sid} })
      toast("Записано!")
    } catch(err) {
      toast(err.message || "Ошибка записи")
      const b = await dbLoadBookings()
      sBk(b)
    }
  }, [toast])

  const rB = useCallback(async (d, t) => {
    const k = `${d}_${t}`
    sBk(p => { const n = {...p}; delete n[k]; return n })
    await dbRemoveBooking(d, t)
    toast("Отменено")
  }, [toast])

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

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    sCs(null); sSts([]); sBk({}); sBl({}); sV("lg")
  }, [])

  if (v === "l") return <div className="app"><div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh"}}>
    <p style={{fontFamily:"Nunito,sans-serif",fontSize:18,color:"#64748b",fontWeight:700}}>Загрузка...</p></div></div>

  return <div className="app">
    {v === "lg" && <Login onA={() => sV("a")} onSt={s => {sCs(s); sV("sv")}}/>}
    {v === "a" && <Admin sts={sts} setSts={sSts} bk={bk} bl={bl} aB={aB} rB={rB} tB={tB} bD={bD} onL={logout} toast={toast}/>}
    {v === "sv" && cs && <StudentView st={cs} onB={() => {sCs(null); sV("lg")}} toast={toast}/>}
    {tt && <div className="tt">{tt}</div>}
  </div>
}
