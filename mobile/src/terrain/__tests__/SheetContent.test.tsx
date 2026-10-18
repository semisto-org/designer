import { act, create } from 'react-test-renderer'
import type { MapFeature } from '@/lib/types'
import { FeatureTop, NoteTop, RestBody, RestTop, TourTop, VisitBody, VisitTop } from '../SheetContent'

jest.mock('@/lib/haptics', () => ({ haptics: { tap: jest.fn(), select: jest.fn(), success: jest.fn(), warning: jest.fn() } }))
jest.mock('@/ui/Icon', () => ({ Icon: () => null }))
jest.mock('@/ui/RemoteImage', () => ({ RemoteImage: () => null }))

const plant: MapFeature = {
  type: 'Feature', id: 7, geometry: { type: 'Point', coordinates: [4.95, 50.32] },
  properties: { id: 7, layer: 'plants', kind: 'plant', name: null, notes: 'Taillé en cépée', status: 'active', lockVersion: 2, species_id: 1, planted_on: '2025-11-20' },
}
const planting = { species: { 1: { id: 1, latinName: 'Ribes rubrum', commonName: 'Groseillier', strata: 'shrub' } }, varieties: {}, palette: [] }

const texts = (tree: ReturnType<typeof create>) =>
  tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join(''))

describe('terrain sheet', () => {
  it('at rest, shows the month and « Noter ici » to editors only', () => {
    let editor!: ReturnType<typeof create>
    let viewer!: ReturnType<typeof create>
    act(() => { editor = create(<RestTop editable onNote={() => {}} />) })
    act(() => { viewer = create(<RestTop editable={false} onNote={() => {}} />) })
    expect(texts(editor)).toContain('Noter ici')
    expect(texts(viewer)).not.toContain('Noter ici')
  })

  it('lists what is around, each row read with its distance in words', () => {
    let tree!: ReturnType<typeof create>
    act(() => {
      tree = create(<RestBody located="yes" planting={planting} viewer={false} onPick={() => {}}
        around={[{ feature: plant, meters: 7.2, direction: 'NE' }]} />)
    })
    const row = tree.root.find((node) => node.props.accessibilityRole === 'button' && typeof node.props.accessibilityLabel === 'string')
    expect(row.props.accessibilityLabel).toBe('Groseillier (Ribes rubrum), a passé son premier hiver ici, à 7 m au nord-est')
  })

  it('says why the list is empty', () => {
    let tree!: ReturnType<typeof create>
    act(() => { tree = create(<RestBody located="denied" planting={planting} viewer={false} onPick={() => {}} around={[]} />) })
    expect(texts(tree).join(' ')).toMatch(/Autorise la localisation/)
  })

  it('offers five things to note', () => {
    const chosen: string[] = []
    let tree!: ReturnType<typeof create>
    act(() => { tree = create(<NoteTop onChoose={(c) => chosen.push(c)} onClose={() => {}} />) })
    const tiles = tree.root.findAll((node) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel && node.props.onPress && (node.type as unknown) !== 'View')
    const labels = [...new Set(tiles.map((n) => n.props.accessibilityLabel))]
    expect(labels).toEqual(expect.arrayContaining(['Planter', 'Relever', 'Identifier', 'Averse', 'Fermer']))
  })

  it('shows a chosen plant with its age, where it stands and its gestures', () => {
    const planted = jest.fn()
    let tree!: ReturnType<typeof create>
    act(() => {
      tree = create(<FeatureTop mapId={1} feature={plant} planting={planting} photo={null} where="à 7 m au nord-est" onClose={() => {}}
        gestures={[{ key: 'planted', icon: 'planted', label: 'Planté aujourd\'hui', onPress: planted, primary: true }]} />)
    })
    expect(texts(tree)).toContain('Groseillier (Ribes rubrum)')
    expect(texts(tree).join(' ')).toMatch(/a passé son premier hiver ici · à 7 m au nord-est/)
    const button = tree.root.find((node) => node.props.accessibilityLabel === 'Planté aujourd\'hui' && node.props.onPress)
    act(() => { button.props.onPress() })
    expect(planted).toHaveBeenCalled()
  })

  it('offers to start a visit next to « Noter ici »', () => {
    const started = jest.fn()
    let tree!: ReturnType<typeof create>
    act(() => { tree = create(<RestTop editable onNote={() => {}} onVisit={started} />) })
    expect(texts(tree)).toContain('Commencer une visite')
  })

  it('during a visit, gives a tile per theme and counts the notes', () => {
    const themes: (string | null)[] = []
    const ended = jest.fn()
    let tree!: ReturnType<typeof create>
    act(() => {
      tree = create(<VisitTop visit={{ key: 'visit-1234abcd', startedAt: new Date().toISOString() }} count={3}
        onTheme={(theme) => themes.push(theme)} onEnd={ended} />)
    })
    const tiles = tree.root.findAll((node) => node.props.accessibilityHint && node.props.onPress && (node.type as unknown) !== 'View')
    const labels = [...new Set(tiles.map((n) => n.props.accessibilityLabel))]
    expect(labels).toEqual(['Envie', 'Eau', 'Sol', 'Arbre en place', 'Faune', 'Vent, soleil, froid', 'Voisins, règles', 'Histoire du lieu', 'Question', 'Autre chose'])
    act(() => { tiles.find((n) => n.props.accessibilityLabel === 'Eau')!.props.onPress() })
    expect(themes).toEqual(['water'])
    expect(texts(tree).join(' ')).toMatch(/Terminer la visite · 3 notes/)
  })

  it('lists the visit notes, the last first, read with their theme', () => {
    const note = (id: number, theme: string, at: string): MapFeature => ({
      type: 'Feature', id, geometry: { type: 'Point', coordinates: [4.95, 50.32] },
      properties: { id, layer: 'notes', kind: 'note_point', name: `Note ${id}`, notes: null, status: 'active', lockVersion: 0, theme, taken_at: at },
    })
    let tree!: ReturnType<typeof create>
    act(() => {
      tree = create(<VisitBody planting={planting} onPick={() => {}}
        notes={[note(1, 'water', '2026-10-18T14:05:00'), note(2, 'question', '2026-10-18T14:20:00')]} />)
    })
    const rows = tree.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.accessibilityLabel === 'string' && (node.type as unknown) !== 'View')
    const labels = [...new Set(rows.map((n) => n.props.accessibilityLabel))]
    expect(labels).toEqual(['Question, Note 2, 14 h 20', 'Eau, Note 1, 14 h 05'])
  })

  it('on the planting round, leads to the plant, then says « Tu y es »', () => {
    const target = { feature: { ...plant, properties: { ...plant.properties, planted_on: undefined, number: 12 } }, meters: 7.2, bearing: 45, direction: 'NE' as const }
    const props = { left: 5, skippedLeft: 0, planting, accuracy: 3, heading: 0, located: true, onPlanted: jest.fn(), onPlantedHere: jest.fn(), onSkip: jest.fn(), onEnd: jest.fn() }
    let far!: ReturnType<typeof create>
    let near!: ReturnType<typeof create>
    act(() => { far = create(<TourTop {...props} target={target} />) })
    act(() => { near = create(<TourTop {...props} target={{ ...target, meters: 1.5 }} />) })
    expect(texts(far)).toContain('7 m')
    expect(texts(far).join(' ')).toMatch(/n° 12 · Groseillier/)
    expect(texts(near)).toContain('Tu y es')
    const planted = near.root.findAll((n) => n.props.accessibilityLabel === 'Planté !' && n.props.onPress)[0]
    act(() => planted.props.onPress())
    expect(props.onPlanted).toHaveBeenCalled()
  })

  it('says when everything is planted', () => {
    let tree!: ReturnType<typeof create>
    act(() => {
      tree = create(<TourTop target={null} left={0} skippedLeft={0} planting={planting} accuracy={3} heading={null} located
        onPlanted={() => {}} onPlantedHere={() => {}} onSkip={() => {}} onEnd={() => {}} />)
    })
    expect(texts(tree)).toContain('Tout est planté')
  })
})
