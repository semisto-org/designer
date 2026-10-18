import { act, create } from 'react-test-renderer'
import type { MapFeature } from '@/lib/types'
import { FeatureTop, NoteTop, RestBody, RestTop } from '../SheetContent'

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
})
