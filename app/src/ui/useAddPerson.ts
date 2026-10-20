import * as A from '../data/actions'
import { useAccount, useAccountMode } from '../data/account'
import { useStore } from '../data/store'
import { ME } from '../domain/types'
import { TAG_RE, uid } from '../domain/util'

export interface AddResult {
  id?: string
  err?: string
}

/**
 * Add someone by name or @tag. A name makes a contact without the app. When signed in to a real account, a @tag looks up
 * the person's account; they are invited once the group is saved and can see the group after they accept.
 */
export function useAddPerson() {
  const store = useStore()
  const account = useAccount()
  const live = useAccountMode() === 'cloud'
  return async (text: string, current: string[], opts: { contactsOnly?: boolean } = {}): Promise<AddResult> => {
    const t = text.trim()
    if (live && account && t.startsWith('@')) {
      if (opts.contactsOnly) return { err: 'To add someone with an account, invite them from the group settings first.' }
      const tag = t.slice(1).toLowerCase()
      if (!TAG_RE.test(tag)) return { err: 'Usertags are 3–20 letters, numbers or _' }
      if (tag === store.get().profile.tag.toLowerCase()) return { err: "That's your own tag" }
      const found = await account.findUser(tag)
      if (!found) return { err: `No user @${tag}. Check the spelling, or add them by name instead.` }
      if (current.includes(found.id) || found.id === ME) return { err: `${found.name} is already here` }
      store.update((s) => ({ ...s, people: { ...s.people, [found.id]: { id: found.id, name: found.name, user: true, tag: found.tag } } }))
      return { id: found.id }
    }
    const r = A.addPersonFromInput(store.get(), t, current, uid('p'))
    if (r.err || !r.id) return { err: r.err ?? 'Could not add' }
    store.update(() => r.state)
    return { id: r.id }
  }
}
