import { ev, item, makeBill, por } from './bills'
import type { AppState, NoteList, Person } from './types'
import { dateIn } from './util'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Sample data used while developing (the same story as the wireframe). */
export function seedState(now = Date.now()): AppState {
  const A3 = ['me', 'james', 'priya']
  const F4 = ['me', 'james', 'eddie', 'sam']
  const quick = (id: string, title: string, date: string, payer: string, amt: number, people: string[], cat: string) =>
    makeBill({ id, title, date, payer, by: payer, rt: amt, people, cat, items: [item(1, title, amt, ev(people.slice()))] })

  const b1 = makeBill({
    id: 'b1', title: 'Whole Foods', cat: 'Groceries', date: dateIn(0, 12), payer: 'james', by: 'james', rt: 8400, people: A3,
    items: [item(1, 'Groceries', 5400, ev(A3)), item(2, 'Cleaning supplies', 3000, ev(A3))],
    comments: [
      { id: 'c1', by: 'priya', text: 'Did we really need the cleaning spray?', ts: now - 2 * DAY },
      { id: 'c2', by: 'james', text: 'Yes, the sink was a disaster.', ts: now - 2 * DAY + HOUR },
    ],
  })
  const b2 = makeBill({
    id: 'b2', title: 'Internet bill', cat: 'Subscriptions', date: dateIn(0, 5), payer: 'me', by: 'me', rt: 6000, people: A3,
    items: [item(1, 'Internet', 6000, ev(A3))],
  })
  const b3 = makeBill({
    id: 'b3', title: 'Trattoria Roma', loc: '12 Main St', cat: 'Eating out', date: dateIn(0, 9), payer: 'me', by: 'me',
    tax: 940, tip: 2350, rt: 15040, people: F4, notes: 'Cab home was split between the three of us who rode together.',
    items: [
      item(1, 'Caesar Salad', 1250, ev(['me'])),
      item(2, 'Ribeye Steak', 3800, ev(['james'])),
      item(3, 'Pasta Carbonara', 1900, ev(['eddie'])),
      item(4, 'Nachos (shared)', 1400, ev(F4)),
      item(5, 'Beer', 1800, por({ me: 1, james: 1, sam: 1 }), 3),
      item(6, 'Cola', 700, por({ eddie: 1, sam: 1 }), 2),
      item(7, 'Tiramisu', 900, ev(['me', 'sam'])),
    ],
    extras: [{ id: 1, name: 'Cab home', amt: 1800, split: 'pick', people: ['me', 'james', 'sam'] }],
  })
  const b4 = makeBill({
    id: 'b4', title: 'Concert tickets', cat: 'Movies & fun', date: dateIn(0, 14), payer: 'me', by: 'me', rt: 8000, people: ['me', 'james'],
    items: [item(1, 'Concert tickets', 8000, por({ me: 1, james: 1 }), 2)],
  })
  const b5 = makeBill({
    id: 'b5', title: 'Airport ride', cat: 'Fuel & travel', date: dateIn(0, 16), payer: 'sam', by: 'me', rt: 4500, people: ['me', 'sam'],
    items: [item(1, 'Airport ride', 4500, ev(['me', 'sam']))],
  })
  const b6 = makeBill({
    id: 'b6', title: 'Birthday brunch', loc: 'Sunny Side Cafe', cat: 'Eating out', date: dateIn(0, 11), payer: 'me', paid: { me: 6000, james: 4000 }, by: 'me',
    rt: 10000, people: F4, notes: "I covered most of it because James's card was low.",
    items: [item(1, 'Brunch for four', 10000, ev(F4))],
  })

  const s1 = quick('s1', 'September internet', dateIn(1, 5), 'me', 6000, A3, 'Subscriptions')
  const s2 = quick('s2', 'Groceries haul', dateIn(1, 14), 'priya', 11200, A3, 'Groceries')
  const s3 = quick('s3', 'August internet', dateIn(2, 5), 'me', 6000, A3, 'Subscriptions')
  const s4 = quick('s4', 'Weekly groceries', dateIn(2, 20), 'james', 9300, A3, 'Groceries')
  const s5 = quick('s5', 'Couch', dateIn(2, 12), 'priya', 24000, A3, 'Furniture')
  const s6 = quick('s6', 'Movie night', dateIn(1, 19), 'me', 7200, F4, 'Movies & fun')
  const s7 = quick('s7', 'Gas for road trip', dateIn(1, 6), 'james', 8800, F4, 'Fuel & travel')
  const s8 = quick('s8', 'Futsal pitch', dateIn(2, 23), 'eddie', 6000, F4, 'Sports')
  const s9 = quick('s9', 'BBQ at the park', dateIn(2, 9), 'me', 14000, F4, 'Eating out')

  const people: Record<string, Person> = {
    me: { id: 'me', name: 'You', user: true, tag: 'shashank' },
    james: { id: 'james', name: 'James', user: true, tag: 'james' },
    priya: { id: 'priya', name: 'Priya', user: true, tag: 'priya' },
    eddie: { id: 'eddie', name: 'Eddie', user: false },
    sam: { id: 'sam', name: 'Sam', user: false },
  }
  const list = (id: string, title: string, memo: string, items: [string, boolean, string?][], ago: number): NoteList => ({
    id, title, memo, ts: now - ago, items: items.map(([t, done, by], i) => ({ id: String(i + 1), t, done, doneBy: by ?? null })),
  })

  return {
    v: 1,
    profile: { name: 'Shashank J.', email: 'you@example.com', tag: 'shashank' },
    password: 'password1',
    signedIn: true,
    people,
    ledgers: [
      {
        id: 'g1', kind: 'group', name: 'Apartment 4B', color: '#0039A6', simplify: true, members: A3,
        bills: [b1, b2, s1, s2, s3, s4, s5],
        payments: [{ id: 'p1', linkId: 'p1', from: 'priya', to: 'me', amt: 1000, date: dateIn(0, 8), note: 'Venmo, thanks!', img: null }],
        lists: [
          list('gl1', 'Costco run', 'Back by 6pm. Bring the big bags.', [['Paper towels', false], ['Dish soap', true, 'james'], ['Lightbulbs (E26)', false]], DAY),
          list('gl2', 'Cleaning day', '', [['Mop', false], ['Sponges', false]], 2 * DAY),
        ],
      },
      {
        id: 'g2', kind: 'group', name: 'Friday Dinners', color: '#FF6319', simplify: false, members: F4,
        bills: [b3, b6, s6, s7, s8, s9], payments: [],
        lists: [list('gl3', 'Party shopping', 'Birthday is on Saturday.', [['Candles for the cake', false], ['Sparkling water', false]], DAY)],
      },
      { id: 'o1', kind: 'one', with: 'james', members: ['me', 'james'], simplify: false, bills: [b4], payments: [], lists: [] },
      { id: 'o2', kind: 'one', with: 'sam', members: ['me', 'sam'], simplify: false, bills: [b5], payments: [], lists: [] },
    ],
    notifs: [
      { id: 'n1', text: 'James added Whole Foods to Apartment 4B', sub: 'You owe $28.00', ts: now - 2 * DAY, read: false, billId: 'b1' },
      { id: 'n2', text: 'Priya paid you $10.00', sub: 'Apartment 4B', ts: now - 4.5 * DAY, read: false, gid: 'g1' },
      { id: 'n3', text: 'You were tagged in Trattoria Roma', sub: 'Friday Dinners', ts: now - 6 * DAY, read: true, billId: 'b3' },
    ],
    notes: [
      list('m1', 'Costco run', '', [['Rice', false], ['Eggs', true], ['Olive oil', false]], DAY),
      list('m2', 'Landlord call', 'Ask about the heater and the lease renewal.', [], 2 * DAY),
      list('m3', 'Gift ideas', '', [['Mum: scarf', false], ['Dad: book', false]], 5 * DAY),
      list('m4', 'Trip packing', 'Flight leaves at 7am.', [['Passport', true], ['Charger', false]], 8 * DAY),
    ],
    noteOrder: [],
    hidden: [],
    sent: [],
  }
}

/** A brand-new account: nothing in it yet. */
export function emptyState(profile: AppState['profile'], password: string): AppState {
  return {
    v: 1, profile, password, signedIn: true,
    people: { me: { id: 'me', name: 'You', user: true, tag: profile.tag } },
    ledgers: [], notifs: [], notes: [], noteOrder: [], hidden: [], sent: [],
  }
}

/** What the app holds while nobody is signed in: no data at all. */
export function loggedOutState(): AppState {
  return { ...emptyState({ name: '', email: '', tag: '' }, ''), signedIn: false }
}
