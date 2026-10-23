import assert from 'node:assert/strict'
import { filterModelGroups, groupModels, modelOptionKey, visibleModelGroups } from './components/model-picker.tsx'

// The catalog owns variant ordering. These labels are intentionally non-alphabetical and are
// treated as opaque values: the UI must preserve the order supplied by the harness rather than
// infer reasoning semantics from their names.
const catalogVariantOrder = ['medium', 'low', 'xhigh', 'high']
const catalog = [
  {
    providerID: 'openai',
    providerName: 'OpenAI',
    modelID: 'gpt-5.6',
    modelName: 'GPT-5.6',
    isDefault: true,
    isFree: true
  },
  ...catalogVariantOrder.map((variant) => ({
    providerID: 'openai',
    providerName: 'OpenAI',
    modelID: 'gpt-5.6',
    modelName: 'GPT-5.6',
    variant,
    isFree: true
  })),
  {
    providerID: 'anthropic',
    providerName: 'Anthropic',
    modelID: 'claude-sonnet',
    modelName: 'Claude Sonnet',
    description: 'Strong code review model',
    isFree: false
  },
  {
    providerID: 'anthropic',
    providerName: 'Anthropic',
    modelID: 'claude-sonnet',
    modelName: 'Claude Sonnet',
    variant: 'thinking',
    isFree: false
  }
]

const groups = groupModels(catalog)
assert.deepEqual(
  groups.map((group) => group.providerID),
  ['openai', 'anthropic'],
  'without advertised priorities, default-first and alphabetical ordering must stay unchanged'
)
const openAI = groups.find((group) => group.providerID === 'openai' && group.modelID === 'gpt-5.6')
const anthropic = groups.find((group) => group.providerID === 'anthropic' && group.modelID === 'claude-sonnet')

assert.ok(openAI, 'the base model and its variants must remain one model group')
assert.ok(anthropic, 'a second model family must remain separate')
assert.equal(modelOptionKey(openAI.base), 'openai|gpt-5.6|')
assert.deepEqual(
  openAI.variants.map((variant) => variant.variant),
  catalogVariantOrder,
  'reasoning/variant order must be exactly the order advertised by the harness catalog'
)
assert.deepEqual(anthropic.variants.map((variant) => variant.variant), ['thinking'])

const prioritizedGroups = groupModels([
  {
    providerID: 'openai',
    providerName: 'OpenAI',
    modelID: 'gpt-5.6',
    modelName: 'GPT-5.6',
    isDefault: true,
    sortPriority: 1
  },
  {
    providerID: 'xiaomi',
    providerName: 'Xiaomi',
    modelID: 'mimo-v2.6-flash',
    modelName: 'MiMo V2.6 Flash',
    sortPriority: 0
  },
  {
    providerID: 'xiaomi',
    providerName: 'Xiaomi',
    modelID: 'mimo-v2.6-flash',
    modelName: 'MiMo V2.6 Flash',
    variant: 'high',
    variantValue: 'xiaomi/mimo-v2.6-flash/high',
    sortPriority: 0
  }
])
assert.deepEqual(
  prioritizedGroups.map((group) => group.providerID),
  ['xiaomi', 'openai'],
  'catalog priority must sort Xiaomi first even when OpenAI is the default'
)
assert.equal(prioritizedGroups[0].variants[0].variantValue, 'xiaomi/mimo-v2.6-flash/high')

assert.deepEqual(
  filterModelGroups(groups, 'anthropic').map((group) => group.modelID),
  ['claude-sonnet'],
  'model search must match provider identity'
)
assert.deepEqual(
  filterModelGroups(groups, 'code review').map((group) => group.modelID),
  ['claude-sonnet'],
  'model search must match catalog descriptions'
)
assert.deepEqual(
  filterModelGroups(groups, 'thinking').map((group) => group.modelID),
  ['claude-sonnet'],
  'model search must match harness-provided variant labels'
)
assert.deepEqual(
  filterModelGroups(groups, 'GPT-5.6').map((group) => group.modelID),
  ['gpt-5.6'],
  'model search must be case-insensitive across model ids/names'
)
assert.deepEqual(
  filterModelGroups(groups, '', true).map((group) => group.modelID),
  ['gpt-5.6'],
  'free-only filtering must use catalog-confirmed free metadata'
)

// ACP `isDefault` only marks the harness's current model (derived from `currentValue`); it does
// not prove the `default` alias resolves to that model. After an explicit choice the alias must
// still be listed so the user can return to the harness default.
const acpCatalog = (currentModelID) => [
  { providerID: 'claude', providerName: 'Claude', modelID: 'default', modelName: 'Default (recommended)', isDefault: currentModelID === 'default' },
  { providerID: 'claude', providerName: 'Claude', modelID: 'opus', modelName: 'Opus', isDefault: currentModelID === 'opus' },
  { providerID: 'claude', providerName: 'Claude', modelID: 'claude-fable-5-1', modelName: 'Fable', isDefault: currentModelID === 'claude-fable-5-1' }
]
for (const currentModelID of ['claude-fable-5-1', 'opus']) {
  const visible = visibleModelGroups(acpCatalog(currentModelID))
  const fallback = visible.find((group) => group.modelID === 'default')
  assert.ok(fallback, `the default alias must stay selectable while ${currentModelID} is the current model`)
  assert.equal(modelOptionKey(fallback.base), 'claude|default|', 'returning to the harness default must remain a selectable choice')
}

console.log('model picker grouping, ordering and filtering behavioral tests passed')
