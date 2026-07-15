/** Weekly digest email HTML template */

interface DigestQuest {
  title: string
  category: string
  starts_at: string
  address: string
  distance_km: number
  source_name: string
  source_url: string | null
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  nature:    { bg: '#1A3318', text: '#4A7C59', label: 'Forage' },
  food:      { bg: '#2A1F0E', text: '#C8913A', label: 'Harvest' },
  craft:     { bg: '#2A1A0E', text: '#B87333', label: 'Build' },
  community: { bg: '#142028', text: '#5B8FA8', label: 'Gather' },
  wellness:  { bg: '#1F1528', text: '#9B72AA', label: 'Wellness' },
  learning:  { bg: '#15182A', text: '#6B7DB3', label: 'Learn' },
  feast:     { bg: '#2A1F0E', text: '#A0522D', label: 'Feast' },
  play:      { bg: '#2A1208', text: '#BF360C', label: 'Play' },
  make:      { bg: '#1F180E', text: '#6D4C2A', label: 'Make' },
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function questCard(q: DigestQuest): string {
  const cat = CATEGORY_COLORS[q.category] ?? CATEGORY_COLORS.community
  const link = q.source_url ? `<a href="${q.source_url}" style="color:#C8913A;text-decoration:none;">${q.title}</a>` : q.title
  return `
    <tr><td style="padding:12px 0;border-bottom:1px solid #1E3A1A;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td>
        <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:${cat.bg};color:${cat.text};letter-spacing:0.05em;">${cat.label}</span>
        <p style="margin:6px 0 2px;font-size:15px;font-weight:500;color:#E8F2E0;line-height:1.3;">${link}</p>
        <p style="margin:0;font-size:11px;color:rgba(232,242,224,0.5);">${formatDate(q.starts_at)} &middot; ${q.address} &middot; ${q.distance_km.toFixed(1)}km</p>
        <p style="margin:4px 0 0;font-size:10px;color:#C8913A;">via ${q.source_name}</p>
      </td></tr></table>
    </td></tr>`
}

export interface DigestNews {
  title: string
  summary: string
  source_name: string
  source_url: string
  petal: string
}

function newsCard(n: DigestNews): string {
  const title = (n.title || '').length > 90 ? (n.title || '').slice(0, 90) + '…' : n.title
  const summary = (n.summary || '').length > 150 ? (n.summary || '').slice(0, 150) + '…' : n.summary
  return `
    <tr><td style="padding:12px 0;border-bottom:1px solid #1E3A1A;">
      <a href="${n.source_url}" style="text-decoration:none;">
        <p style="margin:0 0 4px;font-size:14px;font-weight:500;color:#E8F2E0;line-height:1.3;">${title}</p>
        <p style="margin:0 0 4px;font-size:11px;color:rgba(232,242,224,0.6);line-height:1.4;">${summary}</p>
        <p style="margin:0;font-size:10px;color:#C8913A;">via ${n.source_name}</p>
      </a>
    </td></tr>`
}

export function buildDigestHtml(opts: {
  firstName: string
  city: string
  quests: DigestQuest[]
  news?: DigestNews[]
  unsubscribeUrl: string
}): string {
  const { firstName, city, quests, news, unsubscribeUrl } = opts
  const count = quests.length
  const newsCount = (news || []).length

  const questRows = count > 0
    ? quests.map(questCard).join('\n')
    : `<tr><td style="padding:20px 0;text-align:center;">
        <p style="font-size:14px;color:rgba(232,242,224,0.5);margin:0;">No events near you this week.</p>
        <p style="font-size:12px;color:rgba(232,242,224,0.35);margin:8px 0 0;">Check back soon — or <a href="https://emerge.terralta.org/submit" style="color:#C8913A;">add your own</a>.</p>
      </td></tr>`

  const intro = count > 0
    ? `${count} event${count > 1 ? 's' : ''} near ${city} this week — showing up is all it takes.`
    : `Nothing near ${city} this week — but new events appear every day.`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Emerge — Weekly Events</title></head>
<body style="margin:0;padding:0;background:#0D1A0B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0D1A0B;">
<tr><td align="center" style="padding:0;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:420px;margin:0 auto;">

<!-- Header -->
<tr><td style="padding:32px 24px 20px;text-align:center;background:#0D3D0B;border-radius:0 0 16px 16px;">
  <p style="margin:0;font-size:28px;font-weight:300;color:#E8F2E0;letter-spacing:-0.01em;font-style:italic;">
    em<span style="color:#C8913A;">e</span>rge
  </p>
  <p style="margin:6px 0 0;font-size:9px;color:rgba(232,242,224,0.4);text-transform:uppercase;letter-spacing:0.15em;">
    real events &middot; real community
  </p>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:24px 24px 0;">
  <p style="margin:0;font-size:16px;color:#E8F2E0;">Good morning, ${firstName} &#x1F331;</p>
  <p style="margin:8px 0 0;font-size:12px;color:rgba(232,242,224,0.5);line-height:1.5;">${intro}</p>
</td></tr>

<!-- Event cards -->
<tr><td style="padding:16px 24px 0;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%">
    ${questRows}
  </table>
</td></tr>

<!-- Top regenerative news this week -->
${newsCount > 0 ? `
<tr><td style="padding:24px 24px 4px;">
  <p style="margin:0 0 4px;font-size:10px;color:rgba(232,242,224,0.5);text-transform:uppercase;letter-spacing:0.12em;">
    From the regenerative world
  </p>
  <p style="margin:0;font-size:15px;color:#E8F2E0;font-weight:500;">This week's reading &#x1F33F;</p>
</td></tr>
<tr><td style="padding:4px 24px 0;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%">
    ${(news || []).map(newsCard).join('\n')}
  </table>
</td></tr>
` : ''}

<!-- CTA -->
<tr><td style="padding:24px 24px 0;text-align:center;">
  <a href="https://emerge.terralta.org" style="display:inline-block;padding:12px 28px;background:#C8913A;color:#fff;font-size:13px;font-weight:600;text-decoration:none;border-radius:20px;">
    See all events near you &rarr;
  </a>
</td></tr>

<!-- Footer -->
<tr><td style="padding:32px 24px 24px;text-align:center;">
  <p style="margin:0;font-size:9px;color:rgba(232,242,224,0.25);">
    <a href="https://emerge.terralta.org" style="color:rgba(200,145,58,0.4);text-decoration:none;">emerge.terralta.org</a>
    &nbsp;&middot;&nbsp;
    <a href="${unsubscribeUrl}" style="color:rgba(232,242,224,0.25);text-decoration:underline;">unsubscribe</a>
  </p>
</td></tr>

</table>
</td></tr></table>
</body></html>`
}
