<template>
  <section class="pdf-layout-summary" data-testid="pdf-layout-summary" aria-label="PDF 默认布局">
    <h3>PDF 布局默认值</h3>
    <dl>
      <div>
        <dt>纸张</dt>
        <dd data-testid="pdf-default-paper">{{ input.paper }}</dd>
      </div>
      <div>
        <dt>方向</dt>
        <dd data-testid="pdf-default-orientation">自动</dd>
      </div>
      <div>
        <dt>页边距</dt>
        <dd data-testid="pdf-default-margin">{{ input.marginsMm }} mm</dd>
      </div>
      <div>
        <dt>目标单格</dt>
        <dd data-testid="pdf-default-cell-size">
          {{ input.targetCellMm }} mm（{{ input.readableCellMmRange.min }}～{{
            input.readableCellMmRange.max
          }}
          mm）
        </dd>
      </div>
    </dl>
  </section>
</template>

<script setup lang="ts">
import { createDefaultPdfLayoutInput } from '../../export/pdf/layout'

const input = createDefaultPdfLayoutInput()
</script>

<style scoped>
.pdf-layout-summary {
  padding: var(--space-3);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

h3 {
  margin: 0 0 var(--space-2);
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

dl {
  display: grid;
  gap: var(--space-1);
  margin: 0;
}

dl > div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}

dt,
dd {
  margin: 0;
}

dd {
  color: var(--color-text);
  text-align: right;
}
</style>
