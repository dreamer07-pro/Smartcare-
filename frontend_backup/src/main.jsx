import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const supabase = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY) : null;

const demoPatient = {id:'demo-patient', name:'Demo Patient', email:'patient@example.com', role:'patient'};
const demoDoctor = {id:'demo-doctor', name:'Dr. Priya', email:'doctor@example.com', role:'doctor'};

async function api(path, options={}) {
  const r = await fetch(API + path, {headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options});
  const data = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function App(){
  const [user,setUser]=useState(null);
  const [mode,setMode]=useState('login');
  const [role,setRole]=useState('patient');
  const [loading,setLoading]=useState(false);

  useEffect(()=>{
    if(!supabase) return;
    supabase.auth.getSession().then(({data})=>data.session && loadProfile(data.session.user));
    const {data:sub}=supabase.auth.onAuthStateChange((_e,s)=>s && loadProfile(s.user));
    return ()=>sub.subscription.unsubscribe();
  },[]);

  async function loadProfile(u){
    const {data}=await supabase.from('profiles').select('*').eq('id',u.id).single();
    if(data) setUser(data);
  }

  async function auth(e){
    e.preventDefault(); setLoading(true);
    try{
      if(!supabase){ setUser(role==='doctor'?demoDoctor:demoPatient); return; }
      const email=e.target.email.value, password=e.target.password.value;
      if(mode==='signup'){
        const name=e.target.name.value;
        const {data,error}=await supabase.auth.signUp({email,password});
        if(error) throw error;
        if(data.user){
          await supabase.from('profiles').insert({id:data.user.id,name,email,role});
          if(role==='doctor') await supabase.from('doctors').insert({user_id:data.user.id,specialization:'General Medicine',available_slots:['09:00','09:30','10:00','10:30','11:00']});
        }
        alert('Account created. Check email if confirmation is enabled.');
      } else {
        const {data,error}=await supabase.auth.signInWithPassword({email,password});
        if(error) throw error;
        await loadProfile(data.user);
      }
    }catch(err){alert(err.message)} finally{setLoading(false)}
  }

  if(user) return user.role==='doctor'
    ? <Doctor user={user} logout={()=>setUser(null)}/>
    : <Patient user={user} logout={()=>setUser(null)}/>;

  return <div className="auth"><div className="auth-card">
    <div className="brand">🩺 <b>SmartCare</b></div>
    <h1>{mode==='login'?'Welcome back':'Create account'}</h1>
    <p className="muted">Smart Patient Queue & Medicine Reminder</p>
    <div className="tabs"><button className={role==='patient'?'active':''} onClick={()=>setRole('patient')}>Patient</button><button className={role==='doctor'?'active':''} onClick={()=>setRole('doctor')}>Doctor</button></div>
    <form onSubmit={auth}>
      {mode==='signup' && <input name="name" placeholder="Full name" required/>}
      <input name="email" type="email" placeholder="Email" required/>
      <input name="password" type="password" placeholder="Password" minLength="6" required/>
      <button className="primary" disabled={loading}>{loading?'Please wait…':mode==='login'?'Login':'Sign up'}</button>
    </form>
    <button className="link" onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'New here? Create account':'Already have an account? Login'}</button>
    {!supabase && <div className="demo">Demo mode: credentials are not required. Login to preview the UI.</div>}
  </div></div>
}

function Shell({user,logout,children,title}){
 return <div><header><div className="brand">🩺 SmartCare</div><div className="user">👤 {user.name} <button onClick={logout}>Logout</button></div></header><main><div className="page-title"><div><h1>{title}</h1><p className="muted">Simple, connected healthcare management</p></div></div>{children}</main></div>
}

function Patient({user,logout}){
 const [doctors,setDoctors]=useState([]), [apps,setApps]=useState([]), [reminders,setReminders]=useState([]);
 const [date,setDate]=useState(new Date().toISOString().slice(0,10));
 const [form,setForm]=useState({doctor_id:'',time_slot:'09:00'});
 const [med,setMed]=useState({medicine_name:'',dosage:'',reminder_time:'09:00',frequency:'Daily'});
 const [error,setError]=useState('');
 const load=async()=>{try{
   setDoctors(await api('/doctors'));
   if(user.id!=='demo-patient'){setApps(await api(`/patient/${user.id}/appointments`));setReminders(await api(`/reminders/${user.id}`))}
 }catch(e){setError(e.message)}};
 useEffect(()=>{load()},[]);
 async function book(e){e.preventDefault();try{const a=await api('/appointments',{method:'POST',body:JSON.stringify({...form,patient_id:user.id,date})});alert(`Booked! Your token is Q-${a.token_number}`);load()}catch(e){alert(e.message)}}
 async function addMed(e){e.preventDefault();try{const r=await api('/reminders',{method:'POST',body:JSON.stringify({...med,patient_id:user.id})});setReminders([...reminders,r]);setMed({medicine_name:'',dosage:'',reminder_time:'09:00',frequency:'Daily'})}catch(e){alert(e.message)}}
 const demoApps=user.id==='demo-patient'?[{id:1,date,time_slot:'09:30',token_number:102,status:'waiting'}]:apps;
 return <Shell user={user} logout={logout} title="Patient Dashboard">
  {error && <div className="alert">{error}</div>}
  <div className="grid">
   <section className="card"><h2>📅 Book Appointment</h2><form onSubmit={book}>
    <label>Doctor</label><select value={form.doctor_id} onChange={e=>setForm({...form,doctor_id:e.target.value})} required><option value="">Select doctor</option>{doctors.map(d=><option key={d.id} value={d.id}>{d.profiles?.name||'Doctor'} — {d.specialization}</option>)}</select>
    <label>Date</label><input type="date" value={date} min={new Date().toISOString().slice(0,10)} onChange={e=>setDate(e.target.value)}/>
    <label>Time slot</label><select value={form.time_slot} onChange={e=>setForm({...form,time_slot:e.target.value})}>{['09:00','09:30','10:00','10:30','11:00','11:30'].map(x=><option key={x}>{x}</option>)}</select>
    <button className="primary">Book & Get Token</button>
   </form></section>
   <section className="card highlight"><h2>🎟️ My Queue</h2>{demoApps.length?<>{demoApps.slice(0,2).map(a=><div className="queue-box" key={a.id}><div className="token">Q-{a.token_number}</div><div><b>{a.status==='completed'?'Completed':'Waiting'}</b><p>{a.date} · {a.time_slot}</p><span className="pill">{a.status==='waiting'?'3 patients ahead · ~30 min':a.status}</span></div></div>)}</>:<p>No appointments yet.</p>}</section>
  </div>
  <section className="card"><h2>💊 Medicine Reminders</h2><form className="inline-form" onSubmit={addMed}>
    <input placeholder="Medicine name" value={med.medicine_name} onChange={e=>setMed({...med,medicine_name:e.target.value})} required/>
    <input placeholder="Dosage e.g. 1 tablet" value={med.dosage} onChange={e=>setMed({...med,dosage:e.target.value})} required/>
    <input type="time" value={med.reminder_time} onChange={e=>setMed({...med,reminder_time:e.target.value})}/>
    <select value={med.frequency} onChange={e=>setMed({...med,frequency:e.target.value})}><option>Daily</option><option>Twice daily</option><option>Weekly</option></select>
    <button className="primary">Add Reminder</button>
  </form><div className="reminders">{reminders.map(r=><div className="reminder" key={r.id}>💊 <b>{r.medicine_name}</b><span>{r.dosage} · {r.reminder_time} · {r.frequency}</span></div>)}</div>
  </section>
 </Shell>
}

function Doctor({user,logout}){
 const [doctors,setDoctors]=useState([]),[queue,setQueue]=useState([]),[notes,setNotes]=useState({});
 const today=new Date().toISOString().slice(0,10);
 useEffect(()=>{(async()=>{try{const ds=await api('/doctors');setDoctors(ds);const me=ds.find(d=>d.user_id===user.id)||ds[0];if(me)setQueue(await api(`/queue/${me.id}/${today}`))}catch(e){}})()},[]);
 async function status(id,status){try{await api(`/appointments/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});setQueue(queue.map(x=>x.id===id?{...x,status}:x))}catch(e){alert(e.message)}}
 async function save(id){try{await api('/prescriptions',{method:'POST',body:JSON.stringify({appointment_id:id,notes:notes[id]||''})});alert('Prescription note saved')}catch(e){alert(e.message)}}
 return <Shell user={user} logout={logout} title="Doctor Dashboard">
  <div className="stats"><div className="stat"><b>{queue.filter(x=>x.status==='waiting').length}</b><span>Waiting</span></div><div className="stat"><b>{queue.filter(x=>x.status==='in-progress').length}</b><span>In consultation</span></div><div className="stat"><b>{queue.filter(x=>x.status==='completed').length}</b><span>Completed</span></div></div>
  <section className="card"><div className="section-head"><h2>👥 Today's Live Queue</h2><span className="live">● LIVE</span></div>
  {queue.length?queue.map((p,i)=><div className="patient-row" key={p.id}><div className="token small">Q-{p.token_number}</div><div className="patient-info"><b>{p.profiles?.name||'Patient'}</b><span>{p.time_slot} · {p.status}</span></div><div className="actions">{p.status==='waiting'&&<button onClick={()=>status(p.id,'in-progress')}>Start</button>}{p.status==='in-progress'&&<button className="primary" onClick={()=>status(p.id,'completed')}>Complete</button>}{p.status==='completed'&&<span className="done">✓ Done</span>}</div><div className="notes"><input placeholder="Prescription notes" value={notes[p.id]||''} onChange={e=>setNotes({...notes,[p.id]:e.target.value})}/><button onClick={()=>save(p.id)}>Save</button></div></div>):<div className="empty">No patients in today's queue.</div>}</section>
 </Shell>
}

createRoot(document.getElementById('root')).render(<App/>);
