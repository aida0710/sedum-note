<script setup lang="ts">
import type { DocsHomeAction } from "./homeContent";
import { siteLink } from "./siteLink";

defineProps<{ actions: DocsHomeAction[] }>();
</script>

<template>
  <div class="docs-actions">
    <a v-for="action in actions" :key="action.link" :class="['docs-action', { primary: action.primary }]" :href="siteLink(action.link)">{{ action.text }}</a>
  </div>
</template>
