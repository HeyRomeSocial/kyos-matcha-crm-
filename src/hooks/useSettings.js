import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULTS = {
  from_name: 'Kyos Matcha',
  from_line1: '30 Seagull Lane',
  from_line2: 'E16 1PY, London',
  bank_name: 'KM WELNESS LTD',
  bank_sort: '04-00-05',
  bank_account: '86383529',
}

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('settings').select('*').eq('id', 1).single().then(({ data }) => {
      if (data) setSettings(data)
      setLoading(false)
    })
  }, [])

  return { settings, loading }
}
