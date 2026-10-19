import { describe, expect, it } from 'vitest'
import { checkCode, FRESH_LOCK, loginAttempt, maskEmail, passwordProblem, pwScore, signupProblem, tagStatus } from './auth'

const form = { name: 'Alex Rivera', email: 'alex@example.com', tag: '@Alex_1', pw: 'secret123', terms: true }

describe('passwords', () => {
  it('needs 8 characters and a number', () => {
    expect(passwordProblem('short1')).toBeTruthy()
    expect(passwordProblem('longenough')).toBeTruthy()
    expect(passwordProblem('longenough1')).toBeNull()
  })
  it('scores from weak to strong', () => {
    expect(pwScore('')).toBe(0)
    expect(pwScore('abcdefgh')).toBe(1)
    expect(pwScore('abcdefg1')).toBe(2)
    expect(pwScore('Abcdefg1')).toBe(3)
    expect(pwScore('Abcdefg1!')).toBe(4)
  })
})

describe('user tags', () => {
  it('reports invalid, taken and available', () => {
    expect(tagStatus('', [])).toBe('')
    expect(tagStatus('@ab', [])).toBe('invalid')
    expect(tagStatus('has space', [])).toBe('invalid')
    expect(tagStatus('@James', ['james'])).toBe('taken')
    expect(tagStatus('admin', [])).toBe('taken')
    expect(tagStatus('@Alex_1', ['james'])).toBe('ok')
  })
})

describe('sign up', () => {
  it('accepts a good form', () => expect(signupProblem(form, ['james'])).toBeNull())
  it.each([
    [{ name: '  ' }, 'Enter your name'],
    [{ email: 'nope' }, 'Enter a valid email'],
    [{ tag: 'a' }, 'User tag'],
    [{ tag: 'james' }, 'taken'],
    [{ pw: 'abc' }, 'Password needs'],
    [{ terms: false }, 'agree'],
  ])('rejects %j', (patch, text) => {
    expect(signupProblem({ ...form, ...patch }, ['james'])).toContain(text)
  })
  it('refuses an email that already has an account, ignoring case', () => {
    expect(signupProblem({ ...form, email: 'ME@Example.com' }, [], 'me@example.com')).toContain('already has an account')
  })
})

describe('login lockout', () => {
  it('locks after five misses for 15 seconds and does not count attempts while locked', () => {
    let l = FRESH_LOCK
    for (let i = 1; i <= 4; i++) {
      const r = loginAttempt(l, 1000, false)
      expect(r.msg).toContain(`${5 - i} tries left`)
      l = r.lock
    }
    const fifth = loginAttempt(l, 1000, false)
    expect(fifth.msg).toContain('15s')
    expect(fifth.lock.lockUntil).toBe(16000)
    const locked = loginAttempt(fifth.lock, 6000, true)
    expect(locked.ok).toBe(false)
    expect(locked.msg).toContain('10s')
    expect(loginAttempt(fifth.lock, 16001, true).ok).toBe(true)
  })
  it('a correct login clears earlier misses', () => {
    const r1 = loginAttempt(FRESH_LOCK, 0, false)
    expect(loginAttempt(r1.lock, 1, true).lock).toEqual(FRESH_LOCK)
  })
  it('never reveals which field was wrong', () => {
    expect(loginAttempt(FRESH_LOCK, 0, false).msg).toMatch(/^Wrong email or password/)
  })
})

describe('email code', () => {
  it('accepts the right code and counts wrong tries', () => {
    expect(checkCode(0, '123456').ok).toBe(true)
    expect(checkCode(0, '12').msg).toContain('6-digit')
    expect(checkCode(0, '000000')).toMatchObject({ ok: false, tries: 1 })
    expect(checkCode(4, '000000').msg).toContain('0 tries left')
    expect(checkCode(5, '123456')).toMatchObject({ ok: false, msg: expect.stringContaining('Request a new code') })
  })
})

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => expect(maskEmail('alex@example.com')).toBe('a••••@example.com'))
})
