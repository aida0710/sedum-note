// 1 つを選ぶボタンの並び（role="radiogroup"）。中のボタンは role="radio" と aria-checked を持つ。
// Tab は選んでいる 1 つにだけ止まり、←→・↑↓ で隣を選び、Home・End で端を選ぶ（WAI-ARIA の radio group と同じ）。
// 全部に Tab が止まると、選ぶものが多い所（色の見本、テーマ）を抜けるのに何度も Tab を押すことになる。

import { type KeyboardEvent, type ReactNode, useLayoutEffect, useRef } from "react";

const RADIO_SELECTOR = '[role="radio"]:not(:disabled)';

// キーと、選ぶ先の動かし方。
const STEP_BY_KEY: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

type RadioGroupProps = {
  className?: string;
  // 読み上げの名前。見える見出しがあれば labelledBy でその要素を指す。
  label?: string;
  labelledBy?: string;
  children: ReactNode;
};

function radiosIn(group: HTMLElement): HTMLElement[] {
  return [...group.querySelectorAll<HTMLElement>(RADIO_SELECTOR)];
}

export function RadioGroup({ className, label, labelledBy, children }: RadioGroupProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  // 選んでいるボタンは、描くたびに変わりうる（中のボタンの aria-checked は呼び出し側が決める）ので、毎回付け直す。
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const radios = radiosIn(group);
    const checked = radios.find((radio) => radio.getAttribute("aria-checked") === "true") ?? radios[0];
    for (const radio of radios) {
      radio.tabIndex = radio === checked ? 0 : -1;
    }
  });
  const moveSelection = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEP_BY_KEY[event.key];
    const radios = radiosIn(event.currentTarget);
    const index = radios.indexOf(document.activeElement as HTMLElement);
    if (!step || index === -1) {
      return;
    }
    // 選ぶ動きとして使ったキーは、外の並び（左の列の行の ↑↓ など）へ渡さない。
    event.preventDefault();
    event.stopPropagation();
    const next = radios[step(index, radios.length)];
    next?.focus();
    next?.click();
  };
  return (
    <div ref={groupRef} className={className} role="radiogroup" aria-label={label} aria-labelledby={labelledBy} onKeyDown={moveSelection}>
      {children}
    </div>
  );
}
