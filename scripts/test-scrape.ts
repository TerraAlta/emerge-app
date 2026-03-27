import { extractJsonLd, stripHtml } from '../src/pipeline/sources/utils'

async function main() {
  const url = 'https://www.eventbrite.com/d/united-kingdom--London/permaculture/?page=1'
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } })
  const html = await res.text()
  const events = extractJsonLd(html)
  console.log('Extracted events:', events.length)
  if (events[0]) console.log('First keys:', Object.keys(events[0]).join(', '))
  if (events[0]) console.log('First:', JSON.stringify(events[0]).substring(0, 300))
}
main().catch(console.error)
