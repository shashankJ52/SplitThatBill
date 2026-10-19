import { toBill } from '../../domain/draft'
import { withDraft } from '../../flow/withDraft'
import { PublicBill } from '../PublicBill'

/** What friends would see for the bill still being built. */
export const DraftPreview = withDraft(function DraftPreview({ d }) {
  return <PublicBill bill={toBill(d)} />
})
