import {createClient} from '@supabase/supabase-js'
import {Keys, Urls} from './env';

export const supabase = createClient(
  Urls.supabase,
  Keys.supabase_anon,
);
