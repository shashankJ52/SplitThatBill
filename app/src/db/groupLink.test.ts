import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './harness.ts'

let t: TestDb
let ann: string
let ben: string

const newGroup = async (owner: string, kind: 'group' | 'one' = 'group') => {
  const g = randomUUID()
  await t.as(owner, () => t.sql(`insert into groups (id, kind, name, color, owner_id) values ($1, $2, 'Flat', '#0039A6', $3)`, [g, kind, owner]))
  return g
}

beforeEach(async () => {
  t = await createTestDb()
  ann = await t.signUp('Ann Lee', 'ann')
  ben = await t.signUp('Ben Ray', 'ben')
}, 60_000)

describe('group link and icon', () => {
  it('a new group starts with its link on; a 1-1 does not get one', async () => {
    const g = await newGroup(ann)
    const one = await newGroup(ann, 'one')
    expect((await t.sql('select invite_code from groups where id = $1', [g]))[0].invite_code).toMatch(/^[0-9a-f]{32}$/)
    expect((await t.sql('select invite_code from groups where id = $1', [one]))[0].invite_code).toBeNull()
  })

  it('every group gets its own code', async () => {
    const a = await newGroup(ann)
    const b = await newGroup(ben)
    const codes = (await t.sql('select invite_code from groups where id in ($1, $2)', [a, b])).map((r) => r.invite_code)
    expect(new Set(codes).size).toBe(2)
  })

  it('an admin can still turn the link off and on again', async () => {
    const g = await newGroup(ann)
    await t.as(ann, () => t.sql(`insert into members (group_id, person_id, user_id, display_name, role, status) values ($1, $2, $2, 'Ann Lee', 'owner', 'active')`, [g, ann]))
    await t.as(ann, () => t.sql('select set_invite_link($1, false)', [g]))
    expect((await t.sql('select invite_code from groups where id = $1', [g]))[0].invite_code).toBeNull()
    await t.as(ann, () => t.sql('select set_invite_link($1, true)', [g]))
    expect((await t.sql('select invite_code from groups where id = $1', [g]))[0].invite_code).not.toBeNull()
  })

  it('the icon defaults to empty, can be set, and is capped in length', async () => {
    const g = await newGroup(ann)
    expect((await t.sql('select icon from groups where id = $1', [g]))[0].icon).toBe('')
    await t.as(ann, () => t.sql(`insert into members (group_id, person_id, user_id, display_name, role, status) values ($1, $2, $2, 'Ann Lee', 'owner', 'active')`, [g, ann]))
    await t.as(ann, () => t.sql(`update groups set icon = '🍕' where id = $1`, [g]))
    expect((await t.sql('select icon from groups where id = $1', [g]))[0].icon).toBe('🍕')
    await expect(t.as(ann, () => t.sql(`update groups set icon = repeat('x', 40) where id = $1`, [g]))).rejects.toThrow()
  })
})
