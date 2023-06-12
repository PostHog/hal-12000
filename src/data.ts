import { createClient } from '@supabase/supabase-js'

import { Database } from './data.types'

export const database = createClient<Database>(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)
