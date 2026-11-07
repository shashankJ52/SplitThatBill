/** The message that invites a friend: it opens /u/<tag>, which adds you to their people once they have an account. */
export const inviteText = (tag: string, origin = window.location.origin) => `Add me on SplitThatBill: @${tag} ${origin}/u/${tag}`

/** Share the invite with the phone's share sheet, or copy it. */
export async function shareMyTag(tag: string, toast: (m: string) => void) {
  const t = inviteText(tag)
  try {
    if (navigator.share) return void (await navigator.share({ text: t }).catch(() => undefined))
    await navigator.clipboard.writeText(t)
    toast('Invite copied. Send it to your friend.')
  } catch {
    toast('Copy blocked. Share your tag manually.')
  }
}
