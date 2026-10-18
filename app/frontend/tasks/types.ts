// Tasks of a design project (« Tâches »), as the server sends them
// (Task#as_json, TaskList#as_json, TaskBoard).

export type TaskListData = { id: number; name: string; key?: string | null; position: number }

export type TaskData = {
  id: number
  listId: number
  title: string
  notes?: string
  key?: string
  position: number
  tags: string[]
  /** Editor panel where a default task is done (« Ouvrir dans la carte »). */
  panel?: string
  /** For a default task: whether the map already shows it done (Journey). */
  mapSaysDone?: boolean
  dueOn?: string
  assignee?: Assignee
  completedAt?: string
  completedBy?: string
  createdAt?: string
  /** Elements of the map the task is about (plants, a hedge…). */
  features?: TaskFeature[]
}

/** An element a task is about, with the label the map shows it by (« n° 7 — Pommier »). */
export type TaskFeature = { id: number; kind: string; label: string }

export type Board = { lists: TaskListData[]; tasks: TaskData[]; seeded?: boolean }

/**
 * Who a task is given to: someone with an account (`id`), or an address
 * invited to the map or its team who has not joined yet (`invited`, no id):
 * the task becomes theirs when they join.
 */
export type Assignee = { id?: number; email?: string; name: string; avatarUrl?: string; invited?: boolean }

/** Someone a task can be given to; invitees have an `email` and no `id`. */
export type Participant = { id?: number; email?: string; name: string; role: string }

/** A task on the cross-map page, with its map and list. */
export type TaskWithMap = TaskData & { map: { id: number; name: string }; listName: string }
