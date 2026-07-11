/** @jest-environment jsdom */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { CandidateSourceLabel } from '@/components/CandidateSourceLabel'

it('shows LINE display name when available', () => {
  render(
    <CandidateSourceLabel
      source={{
        kind: 'line_group',
        lineGroupId: 'group-1',
        lineDisplayName: 'Mina',
        messageId: 'msg-1',
      }}
    />,
  )

  expect(screen.getByText('LINE 群組 / Mina 加入')).toBeInTheDocument()
})

it('falls back to generic LINE source text', () => {
  render(
    <CandidateSourceLabel
      source={{ kind: 'line_group', lineGroupId: 'group-1', messageId: 'msg-1' }}
    />,
  )

  expect(screen.getByText('LINE 群組加入')).toBeInTheDocument()
})
