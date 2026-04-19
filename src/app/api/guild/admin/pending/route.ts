/**
 * Admin — list Guild projects pending review, plus recent delivered/rejected ones.
 *
 * GET returns:
 *   - pending: projects in status 'matched' with a draft scoping_doc
 *   - recent:  last 20 delivered + closed for audit
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: pending } = await supabase
    .from('guild_projects')
    .select('id, project_name, country, region, client_user_id, created_at, updated_at, extracted_brief')
    .in('status', ['scoping', 'matched'])
    .order('updated_at', { ascending: false })

  const { data: docs } = await supabase
    .from('guild_scoping_docs')
    .select('*')
    .in('project_id', (pending || []).map(p => p.id))

  const docByProject: Record<string, any> = {}
  ;(docs || []).forEach(d => { docByProject[d.project_id] = d })

  const { data: recent } = await supabase
    .from('guild_projects')
    .select('id, project_name, country, status, updated_at')
    .in('status', ['delivered', 'closed'])
    .order('updated_at', { ascending: false })
    .limit(20)

  // Attach client email — fetch via auth admin in parallel
  const pendingWithEmail = await Promise.all(
    (pending || []).map(async p => {
      const { data: u } = await supabase.auth.admin.getUserById(p.client_user_id)
      return {
        ...p,
        client_email: u?.user?.email || null,
        doc: docByProject[p.id] || null,
      }
    })
  )

  return NextResponse.json({ pending: pendingWithEmail, recent: recent || [] })
}
