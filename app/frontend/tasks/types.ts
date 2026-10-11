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
  assignee?: { id: number; name: string; avatarUrl?: string }
  completedAt?: string
  completedBy?: string
  createdAt?: string
}

export type Board = { lists: TaskListData[]; tasks: TaskData[]; seeded?: boolean }

export type Participant = { id: number; name: string; role: string }

/** A task on the cross-map page, with its map and list. */
export type TaskWithMap = TaskData & { map: { id: number; name: string }; listName: string }
