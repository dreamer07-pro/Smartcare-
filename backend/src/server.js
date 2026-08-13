import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function requireConfig(res) {
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    res.status(500).json({
      error:
        'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    });
    return false;
  }

  return true;
}

app.get('/api/health', (_, res) => {
  res.json({
    ok: true,
    service: 'smart-healthcare-api'
  });
});

app.get('/api/doctors', async (_, res) => {
  if (!requireConfig(res)) return;

  const { data, error } = await supabase
    .from('doctors')
    .select('id,specialization,profiles:user_id(name,email)');

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json(data || []);
});

app.get('/api/queue/:doctorId/:date', async (req, res) => {
  if (!requireConfig(res)) return;

  const { doctorId, date } = req.params;

  const { data, error } = await supabase
    .from('appointments')
    .select(
      'id,token_number,time_slot,status,patient_id,profiles:patient_id(name,email)'
    )
    .eq('doctor_id', doctorId)
    .eq('date', date)
    .order('token_number');

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json(data || []);
});

app.get('/api/patient/:patientId/appointments', async (req, res) => {
  if (!requireConfig(res)) return;

  const { data, error } = await supabase
    .from('appointments')
    .select('id,date,time_slot,token_number,status,doctor_id,doctors:doctor_id(specialization)')
    .eq('patient_id', req.params.patientId)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json(data || []);
});

app.post('/api/appointments', async (req, res) => {
  if (!requireConfig(res)) return;

  const {
    patient_id,
    doctor_id,
    date,
    time_slot
  } = req.body;

  if (!patient_id || !doctor_id || !date || !time_slot) {
    return res.status(400).json({
      error:
        'patient_id, doctor_id, date and time_slot are required.'
    });
  }

  const duplicate = await supabase
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctor_id)
    .eq('date', date)
    .eq('time_slot', time_slot)
    .neq('status', 'completed')
    .limit(1);

  if (duplicate.error) {
    return res.status(400).json({
      error: duplicate.error.message
    });
  }

  if (duplicate.data?.length) {
    return res.status(409).json({
      error: 'That slot is already booked.'
    });
  }

  const existing = await supabase
    .from('appointments')
    .select('token_number')
    .eq('doctor_id', doctor_id)
    .eq('date', date)
    .order('token_number', { ascending: false })
    .limit(1);

  if (existing.error) {
    return res.status(400).json({
      error: existing.error.message
    });
  }

  const token =
    (existing.data?.[0]?.token_number || 100) + 1;

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      patient_id,
      doctor_id,
      date,
      time_slot,
      token_number: token
    })
    .select()
    .single();

  if (error) {
    return res.status(400).json({
      error: error.message
    });
  }

  res.status(201).json(data);
});

app.patch('/api/appointments/:id/status', async (req, res) => {
  if (!requireConfig(res)) return;

  const { status } = req.body;

  if (
    !['waiting', 'in-progress', 'completed'].includes(status)
  ) {
    return res.status(400).json({
      error: 'Invalid status.'
    });
  }

  const { data, error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    return res.status(400).json({
      error: error.message
    });
  }

  res.json(data);
});

app.post('/api/prescriptions', async (req, res) => {
  if (!requireConfig(res)) return;

  const {
    appointment_id,
    notes
  } = req.body;

  const { data, error } = await supabase
    .from('prescriptions')
    .upsert(
      {
        appointment_id,
        notes
      },
      {
        onConflict: 'appointment_id'
      }
    )
    .select()
    .single();

  if (error) {
    return res.status(400).json({
      error: error.message
    });
  }

  res.status(201).json(data);
});

app.get('/api/reminders/:patientId', async (req, res) => {
  if (!requireConfig(res)) return;

  const { data, error } = await supabase
    .from('medicine_reminders')
    .select('*')
    .eq('patient_id', req.params.patientId)
    .order('reminder_time');

  if (error) {
    return res.status(400).json({
      error: error.message
    });
  }

  res.json(data || []);
});

app.post('/api/reminders', async (req, res) => {
  if (!requireConfig(res)) return;

  const {
    patient_id,
    medicine_name,
    dosage,
    reminder_time,
    frequency
  } = req.body;

  const { data, error } = await supabase
    .from('medicine_reminders')
    .insert({
      patient_id,
      medicine_name,
      dosage,
      reminder_time,
      frequency
    })
    .select()
    .single();

  if (error) {
    return res.status(400).json({
      error: error.message
    });
  }

  res.status(201).json(data);
});

app.patch('/api/reminders/:id', async (req, res) => {
  if (!requireConfig(res)) return;

  const { active } = req.body;

  const { data, error } = await supabase
    .from('medicine_reminders')
    .update({ active })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    return res.status(400).json({
      error: error.message
    });
  }

  res.json(data);
});

export default app;