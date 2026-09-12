"use client"

import { create } from "zustand"

export type TaskStatus = "active" | "done" | "error" | "cancelled"

export interface DownloadTask {
  id: string
  name: string
  received: number
  total: number
  status: TaskStatus
  error?: string
}

interface DownloadState {
  tasks: Record<string, DownloadTask>
  start: (id: string, name: string) => void
  progress: (id: string, received: number, total: number) => void
  finish: (id: string) => void
  fail: (id: string, error: string) => void
  cancel: (id: string) => void
  remove: (id: string) => void
  clearFinished: () => void
}

export const useDownloadStore = create<DownloadState>((set) => ({
  tasks: {},
  start: (id, name) =>
    set((s) => {
      const cur = s.tasks[id]
      if (cur && cur.status === "active") return s
      return {
        tasks: { ...s.tasks, [id]: { id, name, received: 0, total: 0, status: "active" } },
      }
    }),
  progress: (id, received, total) =>
    set((s) => {
      const cur = s.tasks[id]
      if (!cur) return s
      return { tasks: { ...s.tasks, [id]: { ...cur, received, total } } }
    }),
  finish: (id) =>
    set((s) => {
      const cur = s.tasks[id]
      if (!cur) return s
      return {
        tasks: {
          ...s.tasks,
          [id]: { ...cur, status: "done", received: cur.total || cur.received },
        },
      }
    }),
  fail: (id, error) =>
    set((s) => {
      const cur = s.tasks[id]
      if (!cur) return s
      return { tasks: { ...s.tasks, [id]: { ...cur, status: "error", error } } }
    }),
  cancel: (id) =>
    set((s) => {
      const cur = s.tasks[id]
      if (!cur) return s
      return { tasks: { ...s.tasks, [id]: { ...cur, status: "cancelled" } } }
    }),
  remove: (id) =>
    set((s) => {
      const tasks = { ...s.tasks }
      delete tasks[id]
      return { tasks }
    }),
  clearFinished: () =>
    set((s) => {
      const tasks: Record<string, DownloadTask> = {}
      for (const t of Object.values(s.tasks)) if (t.status === "active") tasks[t.id] = t
      return { tasks }
    }),
}))
