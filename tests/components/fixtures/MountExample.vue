<template>
  <button type="button" @click="count += 1">点击次数：{{ count }}</button>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
</script>
