<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";

const props = defineProps<{ source: string }>();

marked.setOptions({ gfm: true, breaks: true });

const html = computed(() => {
  const raw = marked.parse(props.source, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      "a", "b", "blockquote", "br", "code", "em", "h1", "h2", "h3", "h4",
      "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "s", "span",
      "strong", "table", "tbody", "td", "th", "thead", "tr", "ul",
    ],
    ALLOWED_ATTR: ["href", "title", "alt", "src", "target", "rel"],
  });
});
</script>

<template>
  <div class="markdown" v-html="html" />
</template>

<style scoped>
.markdown :deep(a) {
  color: var(--accent);
}
.markdown :deep(code) {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.05));
  padding: 0.1em 0.35em;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875em;
}
.markdown :deep(pre) {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.05));
  padding: 0.75rem;
  border-radius: 6px;
  overflow-x: auto;
}
.markdown :deep(pre) code {
  background: transparent;
  padding: 0;
}
.markdown :deep(blockquote) {
  border-left: 3px solid var(--border-primary);
  margin: 0;
  padding-left: 0.75rem;
  color: var(--text-secondary);
}
.markdown :deep(ul),
.markdown :deep(ol) {
  padding-left: 1.25rem;
}
.markdown :deep(p) {
  margin: 0 0 0.5rem 0;
}
</style>
