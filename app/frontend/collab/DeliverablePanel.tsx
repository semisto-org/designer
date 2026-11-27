import { PublicationTabs } from '@/collab/PublishPanel'

/**
 * « Livrable client » (Pro and Team): the client's whole project file at a
 * private link: the plan as a snapshot, plus the documents, photos, videos
 * and soil analyses the team marks « Dans le livrable ».
 * It is the second tab of « Publier »; this panel (no rail entry) opens
 * on it, for the help's buttons and `?panel=deliverable`.
 */
export default function DeliverablePanel() {
  return <PublicationTabs initial="deliverable" />
}
