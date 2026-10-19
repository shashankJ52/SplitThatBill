import { Navigate } from 'react-router-dom'
import type { Draft } from '../domain/draft'
import { useFlow } from './FlowProvider'

/** Wrap a flow page so it only renders while a split is in progress, otherwise it goes back to the start. */
export function withDraft(Inner: (p: { d: Draft }) => React.ReactElement) {
  return function WithDraft() {
    const { draft } = useFlow()
    return draft ? <Inner d={draft} /> : <Navigate to="/scan" replace />
  }
}
