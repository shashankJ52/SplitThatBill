/** A group link opened while signed out is remembered, so it can be followed after logging in or signing up. */
const KEY = 'stb-join'

export function rememberJoin(code: string) {
  try {
    sessionStorage.setItem(KEY, code)
  } catch {
    /* storage can be blocked; the person can open the link again */
  }
}
export function pendingJoin(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}
export function clearPendingJoin() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** The same for a friend's invite link (/u/their-tag): remembered while signed out, followed after signing up or in. */
const FRIEND_KEY = 'stb-friend'

export function rememberFriendTag(tag: string) {
  try {
    sessionStorage.setItem(FRIEND_KEY, tag)
  } catch {
    /* storage can be blocked; the person can open the link again */
  }
}
export function pendingFriendTag(): string | null {
  try {
    return sessionStorage.getItem(FRIEND_KEY)
  } catch {
    return null
  }
}
export function clearPendingFriendTag() {
  try {
    sessionStorage.removeItem(FRIEND_KEY)
  } catch {
    /* ignore */
  }
}
