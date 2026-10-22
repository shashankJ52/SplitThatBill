import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bullet } from '../ui/bits'
import { AccountLink } from './AccountLink'
import { useTheme } from '../ui/useTheme'
import './landing.css'

/** Where people can reach the person running the app. Fill this in before launch; until then the pages say so. */
export const CONTACT_EMAIL = 'shashankclgstuff@gmail.com'

const UPDATED = 'October 2026'
const YEAR = new Date().getFullYear()

function Page({ title, children }: { title: string; children: ReactNode }) {
  const { theme, toggle } = useTheme()
  useEffect(() => {
    const t = document.title
    document.title = `${title} · SplitThatBill`
    return () => void (document.title = t)
  }, [title])
  return (
    <div className="lp">
      <header className="lp-top">
        <Link to="/" className="lp-brand" aria-label="SplitThatBill home">
          <Bullet letter="S" color="#FCCC0A" size={36} />
          <span className="lp-brand-text"><b>SplitThatBill</b><small>The Right Way</small></span>
        </Link>
        <span className="grow" />
        <button className="lp-theme" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>◐</button>
        <AccountLink />
      </header>
      <main className="lp-legal">
        <h1>{title}</h1>
        <p className="mute">Last updated {UPDATED}</p>
        {children}
      </main>
      <footer className="lp-foot">
        <div className="lp-foot-in">
          <span>© {YEAR} SplitThatBill</span>
          <nav aria-label="Legal">
            <Link to="/">Home</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

const contact = CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <>the contact address, which will be listed here before launch</>

export function Privacy() {
  return (
    <Page title="Privacy">
      <p>SplitThatBill helps you split bills with friends. This page says what we keep, who helps us run it, and what you can ask us to do. We have tried to say it plainly.</p>

      <h2>What we keep</h2>
      <ul>
        <li><b>Your account:</b> your name, email address, user tag and password. Passwords are stored by our sign-in provider in scrambled form, so we cannot read them.</li>
        <li><b>What you add:</b> groups, the people in them, bills and their items, payments (including any note or screenshot you attach), comments, lists and notes, and the alerts you receive.</li>
        <li><b>Your settings:</b> such as your default currency and how your Groups tab is arranged.</li>
      </ul>

      <h2>Receipt photos</h2>
      <p>We do not store the photo of a receipt. When you scan one, the photo is sent once to Claude, an AI service run by Anthropic, which reads the items and prices and sends them back. The reader is told to leave out card numbers, expiry dates, authorization codes, names, phone numbers, email addresses and account numbers, and the privacy screen shows what it noticed and left out. This is best effort, so check what you share. Anthropic handles the photo under its own terms and retention rules.</p>

      <h2>Who else handles your data</h2>
      <ul>
        <li><b>Supabase</b> stores the database and sign-in (hosted in the United States).</li>
        <li><b>Vercel</b> serves the website and runs the scanning function.</li>
        <li><b>Anthropic</b> reads receipt photos, as above.</li>
        <li><b>Gmail</b> sends the sign-in codes and password-reset emails.</li>
      </ul>
      <p>We do not sell your data, show ads, or share it with advertisers.</p>

      <h2>What other people can see</h2>
      <p>People in a group you join can see that group's bills, payments, comments, lists and members, and the names and tags of people in it. Someone with a link to a single bill can see that bill, how it is split and first names only, with no account needed. You choose who you invite and what you share.</p>

      <h2>Your choices</h2>
      <ul>
        <li>You can edit your name and tag in the Account tab, and delete bills and payments you created.</li>
        <li>You can delete your account yourself in the Account tab (Delete my account). Groups you run must be handed to someone else first, or deleted. Your name stays on the bills and payments other people still share with you, so their history still adds up, and your notes, lists, alerts and settings are removed.</li>
        <li>To ask what we hold about you, or if you cannot sign in to delete your account, contact us at {contact}.</li>
        <li>You can log out at any time, and the demo keeps its sample data only on your own device.</li>
      </ul>

      <h2>Cookies and storage</h2>
      <p>We use your browser's storage to keep you signed in, remember your light or dark choice, and let the app open quickly offline. We do not use advertising or tracking cookies.</p>

      <h2>Changes</h2>
      <p>If this changes in a way that matters, we will update the date above and tell you in the app.</p>
      <p className="mute">This page is a plain-language summary written for an early version of the app and is not legal advice.</p>
    </Page>
  )
}

export function Terms() {
  return (
    <Page title="Terms">
      <p>By using SplitThatBill you agree to these terms. They are short on purpose.</p>

      <h2>What the app is</h2>
      <p>SplitThatBill keeps track of who owes whom. It does not move money, hold money or process payments. When you record a payment, you are only recording that it happened elsewhere, for example by cash or a bank transfer.</p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Give accurate information and keep your password to yourself.</li>
        <li>Check the items and amounts before you share a split. Receipt reading is automatic and can make mistakes, and the app shows when the numbers do not add up.</li>
        <li>Be respectful. Do not use the app to harass people, send spam, or break the law, and only add people you know.</li>
        <li>Amounts in different currencies are kept separate and are never converted. Any conversion is up to you and your friends.</li>
      </ul>

      <h2>Not advice</h2>
      <p>The app's totals and balances are a convenience. They are not financial, tax or legal advice, and you and your friends are responsible for settling up fairly.</p>

      <h2>Availability</h2>
      <p>This is an early service provided as is. We try to keep it working and your data safe, but we cannot promise it will always be available or free of errors, and we may change or stop features. To the extent the law allows, we are not liable for losses that come from using it.</p>

      <h2>Ending your use</h2>
      <p>You can stop using the app whenever you like, and you can delete your account yourself in the Account tab. We may suspend accounts that break these terms. If you cannot sign in to delete it, contact us at {contact}.</p>

      <h2>Changes</h2>
      <p>We may update these terms. If we do, we will change the date above, and continuing to use the app means you accept the new version.</p>
      <p className="mute">This page is a plain-language draft for an early version of the app and is not legal advice.</p>
    </Page>
  )
}
