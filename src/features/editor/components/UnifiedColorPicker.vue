<template>
  <div class="unified-color-picker" data-testid="unified-color-picker">
    <button
      ref="trigger"
      type="button"
      data-testid="unified-color-picker-toggle"
      aria-haspopup="dialog"
      :aria-expanded="isOpen"
      @click="toggleOpen"
    >
      {{ selectedEntry ? `当前颜色：${selectedEntry.displayCode}` : '选择颜色' }}
    </button>

    <div v-if="isOpen" class="picker-backdrop" @click.self="close">
      <section
        ref="dialog"
        class="picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        data-testid="unified-color-picker-dialog"
        :data-browse-mode="browseMode"
        @keydown="handleDialogKeydown"
      >
        <header class="picker-header">
          <div>
            <h2 id="picker-title">MARD 291 色选色器</h2>
            <p>屏幕颜色仅供预览，请以真实 MARD 色珠或实体色卡为准。</p>
          </div>
          <button type="button" data-testid="picker-close" @click="close">关闭</button>
        </header>

        <label class="picker-search-label" for="picker-search">搜索色号或名称</label>
        <div class="picker-search-row">
          <input
            id="picker-search"
            ref="searchInput"
            v-model="searchQuery"
            type="search"
            autocomplete="off"
            data-testid="picker-search"
            placeholder="输入 colorId、色号或颜色名称"
          />
          <button
            v-if="searchQuery"
            type="button"
            data-testid="picker-clear-search"
            @click="searchQuery = ''"
          >
            清空
          </button>
        </div>

        <div class="picker-mode-tabs" role="tablist" aria-label="颜色浏览方式">
          <button
            type="button"
            role="tab"
            data-testid="picker-mode-family"
            :aria-selected="browseMode === 'family'"
            @click="browseMode = 'family'"
          >
            按色系
          </button>
          <button
            type="button"
            role="tab"
            data-testid="picker-mode-code"
            :aria-selected="browseMode === 'code'"
            @click="browseMode = 'code'"
          >
            按色号
          </button>
        </div>

        <div class="picker-quick-lists">
          <section aria-labelledby="picker-recent-title">
            <h3 id="picker-recent-title">最近使用</h3>
            <div
              v-if="recentEntries.length"
              class="picker-swatches"
              data-testid="picker-recent-list"
            >
              <button
                v-for="recentEntry in recentEntries"
                :key="recentEntry.paletteIndex"
                type="button"
                class="palette-color-button compact"
                :data-testid="`picker-recent-${recentEntry.paletteIndex}`"
                :aria-label="`选择最近使用颜色 ${recentEntry.displayCode}`"
                :aria-pressed="modelValue === recentEntry.paletteIndex"
                :title="`${recentEntry.displayCode} · ${recentEntry.name}`"
                @click="selectColor(recentEntry.paletteIndex)"
              >
                <span class="color-swatch" :style="swatchStyle(recentEntry)" aria-hidden="true" />
                <span>{{ recentEntry.displayCode }}</span>
              </button>
            </div>
            <p v-else class="picker-empty-inline" data-testid="picker-recent-empty">暂无最近使用</p>
          </section>

          <section aria-labelledby="picker-used-title">
            <h3 id="picker-used-title">当前使用</h3>
            <div v-if="usedEntries.length" class="picker-used-list" data-testid="picker-used-list">
              <button
                v-for="item in usedEntries"
                :key="item.entry.paletteIndex"
                type="button"
                class="used-color-row"
                :data-testid="`picker-used-${item.entry.paletteIndex}`"
                :aria-pressed="modelValue === item.entry.paletteIndex"
                @click="selectColor(item.entry.paletteIndex)"
              >
                <span class="color-swatch" :style="swatchStyle(item.entry)" aria-hidden="true" />
                <span>{{ item.entry.displayCode }}</span>
                <span class="used-count">{{ item.count }}</span>
              </button>
            </div>
            <p v-else class="picker-empty-inline" data-testid="picker-used-empty">
              {{ project?.grid ? '当前作品没有已使用颜色' : '暂无作品颜色' }}
            </p>
          </section>
        </div>

        <div class="picker-results-heading">
          <h3>{{ browseMode === 'family' ? '按色系浏览' : '按色号浏览' }}</h3>
          <span>{{ filteredEntries.length }} / 291</span>
        </div>
        <p
          v-if="filteredEntries.length === 0"
          class="picker-no-results"
          data-testid="picker-no-results"
        >
          没有找到匹配的颜色。
        </p>
        <div v-else class="picker-results" data-testid="picker-results">
          <template v-if="browseMode === 'family'">
            <section
              v-for="[family, entries] in familyGroups"
              :key="family"
              class="picker-family"
              :data-testid="`picker-family-${family.replace(':', '-')}`"
            >
              <h4>{{ family }}</h4>
              <div class="picker-swatches">
                <ColorOption
                  v-for="paletteEntry in entries"
                  :key="paletteEntry.paletteIndex"
                  :entry="paletteEntry"
                  :selected="modelValue === paletteEntry.paletteIndex"
                  @select="selectColor"
                />
              </div>
            </section>
          </template>
          <div v-else class="picker-swatches" data-testid="picker-code-results">
            <ColorOption
              v-for="paletteEntry in codeEntries"
              :key="paletteEntry.paletteIndex"
              :entry="paletteEntry"
              :selected="modelValue === paletteEntry.paletteIndex"
              @select="selectColor"
            />
          </div>
        </div>

        <section class="picker-details" aria-labelledby="picker-details-title">
          <div class="picker-details-heading">
            <h3 id="picker-details-title">颜色详情</h3>
            <button
              type="button"
              data-testid="picker-details-toggle"
              :disabled="!selectedEntry"
              :aria-expanded="detailsOpen"
              @click="detailsOpen = !detailsOpen"
            >
              {{ detailsOpen ? '收起详情' : '查看详情' }}
            </button>
          </div>
          <div
            v-if="detailsOpen && selectedEntry"
            class="picker-detail-content"
            data-testid="picker-details"
          >
            <div
              class="detail-color-preview"
              :style="swatchStyle(selectedEntry)"
              aria-hidden="true"
            />
            <dl>
              <div>
                <dt>色号</dt>
                <dd>{{ selectedEntry.displayCode }}</dd>
              </div>
              <div>
                <dt>名称</dt>
                <dd>{{ selectedEntry.name }}</dd>
              </div>
              <div>
                <dt>色系</dt>
                <dd>{{ selectedEntry.family }}</dd>
              </div>
              <div>
                <dt>HEX</dt>
                <dd>{{ selectedEntry.hex }}</dd>
              </div>
              <div>
                <dt>RGB</dt>
                <dd>
                  {{ selectedEntry.rgb.r }}, {{ selectedEntry.rgb.g }}, {{ selectedEntry.rgb.b }}
                </dd>
              </div>
              <div>
                <dt>当前使用数量</dt>
                <dd data-testid="picker-detail-count">{{ selectedUsageCount }}</dd>
              </div>
            </dl>
            <h4>相近颜色</h4>
            <div class="picker-swatches" data-testid="picker-similar-colors">
              <button
                v-for="similarEntry in similarEntries"
                :key="similarEntry.paletteIndex"
                type="button"
                class="palette-color-button compact"
                :data-testid="`picker-similar-${similarEntry.paletteIndex}`"
                :aria-label="`选择相近颜色 ${similarEntry.displayCode}`"
                :aria-pressed="modelValue === similarEntry.paletteIndex"
                :title="`${similarEntry.displayCode} · ${similarEntry.name}`"
                @click="selectColor(similarEntry.paletteIndex)"
              >
                <span class="color-swatch" :style="swatchStyle(similarEntry)" aria-hidden="true" />
                <span>{{ similarEntry.displayCode }}</span>
              </button>
            </div>
          </div>
          <p v-else-if="!selectedEntry" class="picker-empty-inline">先选择一种颜色以查看详情。</p>
        </section>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useEditorStore } from '../../../app/stores/editorStore'
import { MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../../../domain/project/constants'
import { deriveProjectStats } from '../../../domain/project/stats'
import type { Project } from '../../../domain/project/types'
import {
  findSimilarPaletteColors,
  getPaletteEntryByIndex,
  groupPaletteEntriesByFamily,
  MARD_291_PALETTE,
  searchPalette,
  sortPaletteEntries,
  type PaletteEntry,
} from '../../../domain/palette'

const props = defineProps<{ modelValue: number | null; project?: Project | null }>()
const emit = defineEmits<{ 'update:modelValue': [paletteIndex: number] }>()

type BrowseMode = 'code' | 'family'

const ColorOption = defineComponent({
  name: 'PaletteColorOption',
  props: {
    entry: { type: Object as () => PaletteEntry, required: true },
    selected: { type: Boolean, required: true },
  },
  emits: ['select'],
  setup(optionProps, { emit: optionEmit }) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          class: 'palette-color-button',
          'data-testid': `picker-color-${optionProps.entry.paletteIndex}`,
          'data-color-index': optionProps.entry.paletteIndex,
          'aria-label': `选择 ${optionProps.entry.displayCode} ${optionProps.entry.name}`,
          'aria-pressed': optionProps.selected,
          title: `${optionProps.entry.displayCode} · ${optionProps.entry.name}`,
          onClick: () => optionEmit('select', optionProps.entry.paletteIndex),
        },
        [
          h('span', {
            class: 'color-swatch',
            style: { backgroundColor: optionProps.entry.hex },
            'aria-hidden': 'true',
          }),
          h('span', { class: 'color-code' }, optionProps.entry.displayCode),
        ],
      )
  },
})

const isOpen = ref(false)
const browseMode = ref<BrowseMode>('family')
const searchQuery = ref('')
const detailsOpen = ref(false)
const editor = useEditorStore()
const trigger = ref<HTMLButtonElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const dialog = ref<HTMLElement | null>(null)

const selectedEntry = computed(() => {
  const index = props.modelValue
  if (
    index === null ||
    !Number.isInteger(index) ||
    index < MIN_PALETTE_INDEX ||
    index > MAX_PALETTE_INDEX
  ) {
    return undefined
  }
  return getPaletteEntryByIndex(MARD_291_PALETTE, index)
})

const filteredEntries = computed(() => searchPalette(MARD_291_PALETTE, searchQuery.value))
const codeEntries = computed(() => sortPaletteEntries(filteredEntries.value, 'displayCode'))
const familyGroups = computed(() => groupPaletteEntriesByFamily(filteredEntries.value))
const projectStats = computed(() => {
  const project = props.project
  return project?.grid ? deriveProjectStats(project) : null
})
const usedEntries = computed(() => {
  const stats = projectStats.value
  if (!stats) return []
  return stats.usedPaletteIndices
    .map((paletteIndex) => ({
      entry: getPaletteEntryByIndex(MARD_291_PALETTE, paletteIndex),
      count: stats.usageByPaletteIndex[paletteIndex],
    }))
    .filter((item): item is { entry: PaletteEntry; count: number } => item.entry !== undefined)
    .sort(
      (left, right) =>
        right.count - left.count || left.entry.paletteIndex - right.entry.paletteIndex,
    )
})
const selectedUsageCount = computed(() => {
  const index = selectedEntry.value?.paletteIndex
  return index === undefined ? 0 : (projectStats.value?.usageByPaletteIndex[index] ?? 0)
})
const similarEntries = computed(() => {
  const selected = selectedEntry.value
  if (!selected) return []
  return findSimilarPaletteColors(MARD_291_PALETTE, selected.colorId, 6)
    .map(({ paletteIndex }) => getPaletteEntryByIndex(MARD_291_PALETTE, paletteIndex))
    .filter((entry): entry is PaletteEntry => entry !== undefined)
})
const recentEntries = computed(() =>
  editor.recentPaletteIndexes
    .map((paletteIndex) => getPaletteEntryByIndex(MARD_291_PALETTE, paletteIndex))
    .filter((entry): entry is PaletteEntry => entry !== undefined),
)

function swatchStyle(entry: PaletteEntry) {
  return { backgroundColor: entry.hex }
}

function selectColor(paletteIndex: number) {
  if (!getPaletteEntryByIndex(MARD_291_PALETTE, paletteIndex)) return
  emit('update:modelValue', paletteIndex)
}

function open() {
  browseMode.value = 'family'
  detailsOpen.value = false
  isOpen.value = true
}

function close() {
  isOpen.value = false
}

function toggleOpen() {
  if (isOpen.value) close()
  else open()
}

function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab' || !dialog.value) return

  const focusable = Array.from(
    dialog.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  )
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(isOpen, async (openState) => {
  if (openState) {
    await nextTick()
    searchInput.value?.focus()
    return
  }

  browseMode.value = 'family'
  detailsOpen.value = false
  await nextTick()
  trigger.value?.focus()
})

onBeforeUnmount(() => {
  isOpen.value = false
})
</script>

<style scoped>
.unified-color-picker {
  margin-top: var(--space-4);
}

.picker-backdrop {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: rgb(15 23 42 / 55%);
}

.picker-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  box-sizing: border-box;
  width: min(960px, 96vw);
  max-height: min(90vh, 900px);
  padding: var(--space-4);
  overflow: auto;
  color: var(--color-text-primary);
  background: var(--color-panel-background);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 16px 48px rgb(15 23 42 / 24%);
}

.picker-header,
.picker-details-heading,
.picker-results-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

h2,
h3,
h4,
p {
  margin: 0;
}

.picker-header p,
.picker-empty-inline,
.picker-results-heading span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.picker-search-label {
  font-weight: 600;
}

.picker-search-row {
  display: flex;
  gap: var(--space-2);
}

.picker-search-row input {
  flex: 1;
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  color: inherit;
  background: var(--color-page-background);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
}

.picker-mode-tabs,
.picker-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.picker-mode-tabs [aria-selected='true'] {
  color: var(--color-action);
  border-color: var(--color-action);
}

.picker-quick-lists {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-4);
}

.picker-quick-lists section,
.picker-family,
.picker-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.picker-used-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.used-color-row,
.palette-color-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 7px;
  color: inherit;
  background: var(--color-panel-background);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.palette-color-button {
  flex-direction: column;
  min-width: 64px;
  font-size: var(--font-size-sm);
}

.palette-color-button.compact {
  flex-direction: row;
  min-width: auto;
}

.palette-color-button[aria-pressed='true'],
.used-color-row[aria-pressed='true'] {
  outline: 2px solid var(--color-action);
  outline-offset: 1px;
}

.color-swatch {
  display: inline-block;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border: 1px solid rgb(15 23 42 / 28%);
  border-radius: 4px;
}

.used-count {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.picker-results {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-height: 360px;
  padding: var(--space-2);
  overflow: auto;
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
}

.picker-family h4 {
  color: var(--color-text-secondary);
}

.picker-details {
  padding-top: var(--space-3);
  border-top: var(--border-width) solid var(--color-border);
}

.picker-details-heading {
  align-items: center;
}

.picker-detail-content {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  gap: var(--space-3);
}

.detail-color-preview {
  grid-row: span 2;
  min-height: 100px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;
}

dl div {
  min-width: 0;
}

dt {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.picker-detail-content h4,
.picker-detail-content [data-testid='picker-similar-colors'] {
  grid-column: 1 / -1;
}

button:focus-visible,
input:focus-visible {
  outline: 3px solid var(--color-action);
  outline-offset: 2px;
}

@media (max-width: 680px) {
  .picker-quick-lists,
  .picker-detail-content {
    grid-template-columns: 1fr;
  }

  .detail-color-preview {
    grid-row: auto;
    min-height: 64px;
  }
}
</style>
