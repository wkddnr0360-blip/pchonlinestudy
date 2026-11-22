import Dexie, { type EntityTable } from 'dexie'
import type { ExamQuestion } from '../exam/generate'
import type { Ox, Scope, Stage } from '../book/types'

export interface StudySession {
  key: string
  id: string
  scope: Scope
  mode: 'order' | 'random'
  version: string
  numbers: number[]
  position: number
  updatedAt: number
}
export interface OxAttempt {
  id: string
  sessionId: string
  no: number
  answer: Ox
  correct: boolean
  at: number
}
export interface ExamSession {
  id: string
  version: string
  status: 'active' | 'submitted'
  questions: ExamQuestion[]
  responses: (number | null)[]
  position: number
  startedAt: number
  deadline: number
  submittedAt?: number
}
export interface ReviewItem {
  id: string
  type: 'ox' | 'exam'
  no: number
  chapterKey: string
  stage: Stage
  examId?: string
  examPosition?: number
  at: number
  resolved: boolean
}
export interface Setting {
  key: 'patchRead' | 'releaseSeen' | 'feedback'
  value: string
}

export interface BackupTarget {
  key: 'primary'
  id: string
  destination: 'device' | 'folder'
  folder?: FileSystemDirectoryHandle
  lastSavedAt?: number
  digest?: string
  problem?: 'permission' | 'write'
}
export interface BackupSnapshot {
  at: number
  json: string
}

export class StudyDatabase extends Dexie {
  studies!: EntityTable<StudySession, 'key'>
  attempts!: EntityTable<OxAttempt, 'id'>
  exams!: EntityTable<ExamSession, 'id'>
  reviews!: EntityTable<ReviewItem, 'id'>
  settings!: EntityTable<Setting, 'key'>
  backupTargets!: EntityTable<BackupTarget, 'key'>
  snapshots!: EntityTable<BackupSnapshot, 'at'>

  constructor(name = 'police-constitution-ox') {
    super(name)
    this.version(1).stores({
      studies: 'key,updatedAt',
      attempts: 'id,no,sessionId,at',
      exams: 'id,status,startedAt',
      reviews: 'id,stage,chapterKey,at',
      settings: 'key',
    })
    this.version(2).stores({ backupTargets: 'key', snapshots: 'at' })
  }
}

export const db = new StudyDatabase()
