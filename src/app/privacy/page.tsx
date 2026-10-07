import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy policy — Emerge',
  description: 'What Emerge collects, why, who helps us run it, and how to delete your account.',
}

const UPDATED = '7 October 2026'
const CONTACT = 'terraalta.sintra@gmail.com'

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading text-[19px] font-light mt-8 mb-2" style={{ color: 'var(--color-text)' }}>{children}</h2>
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>{children}</p>
}
function Li({ children }: { children: React.ReactNode }) {
  return <li className="text-[14px] leading-relaxed mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>{children}</li>
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen font-body" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-[680px] mx-auto px-4 py-10">
        <a href="/" className="text-[13px] font-medium" style={{ color: 'var(--color-amber)' }}>← Emerge</a>
        <h1 className="font-heading text-[30px] font-light mt-4 mb-1" style={{ color: 'var(--color-text)' }}>Privacy policy</h1>
        <p className="text-[12px] mb-6" style={{ color: 'var(--color-text-muted)' }}>Last updated {UPDATED}</p>

        <P>
          Emerge is free, has no ads and never sells your data. This page explains, in plain language, what we
          collect, why, who helps us run the app, and how you can see, change or delete your data.
        </P>

        <H>Who we are</H>
        <P>
          Emerge (emerge.terralta.org) is run by Pedro Valdjiu / Terra Alta, Sintra, Portugal, who is responsible
          for your data. Questions or requests: <a href={`mailto:${CONTACT}`} className="underline" style={{ color: 'var(--color-amber)' }}>{CONTACT}</a>.
        </P>

        <H>What we collect</H>
        <ul className="list-disc pl-5 mb-3">
          <Li><strong>Account:</strong> your email address, a password (stored only in scrambled, hashed form) and your first name.</Li>
          <Li><strong>Location:</strong> to show events near you. If you allow it, your browser shares your position; it stays on your device unless you turn on the weekly email, in which case we save an approximate location and radius so we can pick nearby events for you.</Li>
          <Li><strong>What you do in the app:</strong> events you join or post, skills you add, news you save or mark as resonating, your progress in the learning quests, and your journal entries (private — only you can read them).</Li>
          <Li><strong>The Guild (only if you use it):</strong> your practitioner profile (name, bio, photo, country, links, specialties — public once verified), the conversation with the Guild interviewer, projects and pitches you create, and files or links you share for them.</Li>
          <Li><strong>Event links you submit</strong>, and anything you send us through reports or support.</Li>
          <Li><strong>On your device:</strong> the app stores your sign-in session, location and preferences in your browser&apos;s local storage. We use no advertising or tracking cookies.</Li>
        </ul>

        <H>Why we use it</H>
        <ul className="list-disc pl-5 mb-3">
          <Li>To run the app you signed up for: show nearby events, keep your progress and journal, run the Guild (this is necessary to provide the service).</Li>
          <Li>To send the weekly email of nearby events — only if you switch it on (your consent; switch it off any time in Settings or with the link in each email).</Li>
          <Li>To keep Emerge safe and affordable: prevent abuse and keep AI costs within limits (our legitimate interest).</Li>
        </ul>
        <P>We don&apos;t use your data for advertising, profiling or selling, and we don&apos;t use algorithms to decide what you see beyond distance and dates.</P>

        <H>Who helps us run Emerge</H>
        <P>A few services process data on our behalf, only to provide the app:</P>
        <ul className="list-disc pl-5 mb-3">
          <Li><strong>Supabase</strong> — database and sign-in (servers in Ireland, EU).</Li>
          <Li><strong>Vercel</strong> — hosts the website.</Li>
          <Li><strong>Anthropic (Claude AI)</strong> — reads Guild conversations, project briefs and submitted event pages to help draft profiles and documents and to check events fit Emerge. Located in the United States. Anthropic does not use this data to train its models under its commercial terms.</Li>
          <Li><strong>Google (Gmail)</strong> — sends our emails.</Li>
          <Li><strong>OpenStreetMap, CARTO, Nominatim and Photon (Komoot)</strong> — map tiles and turning places into map positions; your browser contacts them directly when you use the map or search a place.</Li>
          <Li><strong>Luma</strong> — only if you connect a Luma calendar; we store your Luma key encrypted.</Li>
        </ul>
        <P>Some of these are outside the EU. Where that&apos;s the case, transfers rely on the safeguards those providers offer under EU data-protection law.</P>

        <H>How long we keep it</H>
        <P>
          As long as you have an account. When you delete it, your personal data is removed straight away. Events you
          posted stay public without your name, and basic usage records (such as AI cost logs) are kept without any
          link to you.
        </P>

        <H>Your rights</H>
        <P>
          You can see and change most of your data in the app. You can also ask us for a copy of your data, to
          correct it, or to stop using it — email <a href={`mailto:${CONTACT}`} className="underline" style={{ color: 'var(--color-amber)' }}>{CONTACT}</a>.
          <strong> To delete your account, open Settings and choose &ldquo;Delete my account&rdquo;</strong> — or email us and we&apos;ll do it.
          If you&apos;re unhappy with how we handle your data, you can complain to the Portuguese data-protection
          authority, CNPD (cnpd.pt), or the authority where you live.
        </P>

        <H>Children</H>
        <P>Emerge isn&apos;t meant for children under 16, and we don&apos;t knowingly collect their data.</P>

        <H>Changes</H>
        <P>If we change this policy we&apos;ll update the date at the top, and tell you in the app if the change is significant.</P>
      </div>
    </main>
  )
}
