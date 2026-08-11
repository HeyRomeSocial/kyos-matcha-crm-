import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async () => {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
  const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI')!

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
  })

  return Response.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    302
  )
})
