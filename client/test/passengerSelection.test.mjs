import assert from 'node:assert/strict'
import test from 'node:test'
import {
  inheritPassengers,
  removePassengerFromSlot,
  setPassengerInSlot,
} from '../src/utils/passengerSelection.ts'
import { MOVEMENT_TIME_OPTIONS } from '../src/utils/movementTimeOptions.ts'

test('movement time choices use five-minute increments only', () => {
  assert.ok(MOVEMENT_TIME_OPTIONS.includes('08:00'))
  assert.ok(MOVEMENT_TIME_OPTIONS.includes('08:05'))
  assert.ok(MOVEMENT_TIME_OPTIONS.includes('09:55'))
  assert.ok(!MOVEMENT_TIME_OPTIONS.includes('08:03'))
  assert.ok(!MOVEMENT_TIME_OPTIONS.includes('09:17'))
  assert.ok(MOVEMENT_TIME_OPTIONS.every((time) => Number(time.slice(-2)) % 5 === 0))
})

test('M02 and M03 inherit a copy of the immediately preceding segment', () => {
  const m01 = ['leader', 'employee-a']
  const m02 = inheritPassengers([m01], 'leader')
  const withM02Addition = setPassengerInSlot([m01, m02], 1, 2, 'employee-b')
  const m03 = inheritPassengers(withM02Addition, 'leader')

  assert.deepEqual(m02, m01)
  assert.notEqual(m02, m01)
  assert.deepEqual(m03, ['leader', 'employee-a', 'employee-b'])
})

test('customizing M02 does not modify M01 or an existing M03', () => {
  const initial = [
    ['leader', 'employee-a'],
    ['leader', 'employee-a'],
    ['leader', 'employee-a', 'employee-c'],
  ]
  const changed = removePassengerFromSlot(initial, 1, 1)

  assert.deepEqual(changed[0], ['leader', 'employee-a'])
  assert.deepEqual(changed[1], ['leader', ''])
  assert.deepEqual(changed[2], ['leader', 'employee-a', 'employee-c'])
})

test('duplicate passenger choices are ignored and selections are capped at seven slots', () => {
  const full = [['leader', 'a', 'b', 'c', 'd', 'e', 'f']]
  assert.deepEqual(setPassengerInSlot(full, 0, 6, 'a'), full)
  assert.deepEqual(setPassengerInSlot(full, 0, 7, 'g')[0], full[0])
})
