import { Link } from '@inertiajs/react'
import { ListTodo } from 'lucide-react'
import { buttonClass } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'

/** Header action « Tâches »: the map's task lists, on their own page. */
export default function TasksLink() {
  const { map } = useEditor()
  return (
    <Link href={`/maps/${map.id}/tasks`} className={buttonClass('ghost', 'sm')}>
      <ListTodo className="h-4 w-4" />
      <span className="hidden sm:inline">{t('tasks.view')}</span>
      <span className="sr-only sm:hidden">{t('tasks.view')}</span>
    </Link>
  )
}
