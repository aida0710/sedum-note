<script setup lang="ts">
// トップのページ。中身は index.md の frontmatter の docsHome（形は homeContent.ts）から読み、作りはどの製品でも同じにする。
import { computed } from "vue";
import { useData } from "vitepress";
import DocsHomeActions from "./DocsHomeActions.vue";
import type { DocsHome } from "./homeContent";
import { siteLink } from "./siteLink";

const { frontmatter } = useData();
const home = computed(() => frontmatter.value.docsHome as DocsHome);

function featureNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}
</script>

<template>
  <div class="docs-home">
    <section class="docs-hero">
      <h1 class="docs-title">{{ home.name }}</h1>
      <p class="docs-lead" v-html="home.lead" />
      <p v-if="home.platforms" class="docs-platforms"><span>{{ home.platforms.label }}</span>{{ home.platforms.text }}</p>
      <DocsHomeActions :actions="home.actions" />
      <div v-if="home.preview" class="docs-preview">
        <div class="docs-preview-bar" aria-hidden="true"><span /><span /><span /></div>
        <img :src="siteLink(home.preview.src)" :alt="home.preview.alt" :width="home.preview.width" :height="home.preview.height">
      </div>
    </section>

    <section v-for="section in home.sections" :key="section.heading" class="docs-section">
      <div class="docs-section-heading">
        <h2>{{ section.heading }}</h2>
        <p v-if="section.lead" v-html="section.lead" />
      </div>
      <div v-if="section.features" class="docs-feature-grid">
        <article v-for="(feature, index) in section.features" :key="feature.title" :class="['docs-feature', { wide: feature.wide }]">
          <img class="docs-feature-image" :src="siteLink(feature.image)" :alt="feature.alt" loading="lazy">
          <div class="docs-feature-body">
            <span class="docs-feature-number">{{ featureNumber(index) }}</span>
            <h3>
              <a v-if="feature.link" :href="siteLink(feature.link)">{{ feature.title }}</a>
              <template v-else>{{ feature.title }}</template>
            </h3>
            <p v-html="feature.body" />
          </div>
        </article>
      </div>
      <ul v-if="section.links" class="docs-link-list">
        <li v-for="item in section.links" :key="item" v-html="item" />
      </ul>
      <div v-if="section.command" class="docs-command">
        <code>{{ section.command.code }}</code>
        <span v-if="section.command.label">{{ section.command.label }}</span>
      </div>
      <DocsHomeActions v-if="section.actions" :actions="section.actions" />
    </section>
  </div>
</template>
