import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://omyjqrsmjnqotlyjjdgm.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_7j018UgR4zn80GX2v5caBw_a4jEGTS3'

export const supabase = createClient(supabaseUrl, supabaseKey)
