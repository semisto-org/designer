// Writes test/fixtures/files/growth_curve_cases.json from the browser's growth curve
// (app/frontend/relief/growth.ts), the cases the Ruby port (PlantGrowth::Curve) must match.
// After a change to the curve, on both sides: node --experimental-strip-types script/growth_curve_cases.ts
import { writeFileSync } from 'node:fs'
import { graftOf, plantForm, sizeAt, trainingOf, type GraftData, type PlantStrata } from '../app/frontend/relief/growth.ts'

type Input = { strata: PlantStrata; plantType: string | null; heightM: number; spreadM: number; maturityYears: number; training: string | null; graft: GraftData | null; until: number | null; age: number }
const base: Omit<Input, 'age'> = { strata: 'canopy', plantType: 'tree', heightM: 25, spreadM: 15, maturityYears: 25, training: null, graft: null, until: null }
const inputs: Omit<Input, 'age'>[] = [
  base,
  { ...base, strata: 'sub_canopy', heightM: 10, spreadM: 8, maturityYears: 12 },
  { ...base, strata: 'shrub', plantType: 'shrub', heightM: 6, spreadM: 5, maturityYears: 8 },
  { ...base, strata: 'herbaceous', plantType: 'herb', heightM: 0.8, spreadM: 0.6, maturityYears: 2 },
  { ...base, strata: 'vine', plantType: 'climber', heightM: 8, spreadM: 2, maturityYears: 4 },
  { ...base, training: 'pollard' },
  { ...base, strata: 'shrub', plantType: 'shrub', heightM: 6, spreadM: 5, maturityYears: 8, training: 'coppice' },
  { ...base, strata: 'sub_canopy', heightM: 10, spreadM: 8, maturityYears: 12, training: 'chop_and_drop', until: 12 },
  { ...base, strata: 'sub_canopy', heightM: 10, spreadM: 8, maturityYears: 12, graft: { form: 'bush', trunkHeight: null, vigor: null, rootstock: 'M26' } },
  { ...base, strata: 'sub_canopy', heightM: 10, spreadM: 8, maturityYears: 12, graft: { form: null, trunkHeight: 1.6, vigor: 'dwarf', rootstock: null } },
  { ...base, strata: 'sub_canopy', heightM: 10, spreadM: 8, maturityYears: 12, graft: { form: 'standard', trunkHeight: null, vigor: null, rootstock: null } },
  { ...base, strata: 'canopy', heightM: 12, spreadM: 8, maturityYears: 25, until: 10 },
]
const ages = [-1, 0, 0.5, 1, 3, 5, 10, 15, 30, 1000]
const cases = inputs.flatMap((input) => ages.map((age) => {
  const form = plantForm(input.strata, input.plantType)
  const training = trainingOf(form, input.training)
  const graft = training === 'free' ? graftOf(form, input.graft) : null
  const size = sizeAt({ strata: input.strata, heightM: input.heightM, spreadM: input.spreadM, maturityYears: input.maturityYears, training, graft, until: input.until }, age)
  return { input: { ...input, age }, expected: size && { height: Math.round(size.height * 1e6) / 1e6, spread: Math.round(size.spread * 1e6) / 1e6 } }
}))
writeFileSync(process.argv[2] ?? 'test/fixtures/files/growth_curve_cases.json', '{\n  "note": "Generated from app/frontend/relief/growth.ts (sizeAt). Regenerate with script/growth_curve_cases.ts; checked by test/frontend/time/growth.test.ts and test/models/plant_growth/curve_test.rb.",\n  "cases": [\n' + cases.map((c) => '    ' + JSON.stringify(c)).join(',\n') + '\n  ]\n}\n')
console.log(`${cases.length} cases`)
