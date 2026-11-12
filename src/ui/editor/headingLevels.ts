// 本文に入れられる見出しの段（Markdown の見出しと同じ 6 段）。

export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];
