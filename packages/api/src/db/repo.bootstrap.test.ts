import { describe, expect, test } from 'bun:test'
import { makeDb } from '../test/harness'
import { users } from './schema'
import { superadminExists } from './repo'

describe('superadminExists', () => {
  test('superadminExists-reflects-rows: false with no superadmin, true once one exists', async () => {
    const db = makeDb()
    expect(await superadminExists(db)).toBe(false)

    await db.insert(users).values({ id: 'm1', email: 'm@x.com', role: 'member' })
    expect(await superadminExists(db)).toBe(false)

    await db.insert(users).values({ id: 's1', email: 's@x.com', role: 'superadmin' })
    expect(await superadminExists(db)).toBe(true)
  })
})
