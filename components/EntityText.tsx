"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import { entityParts } from "@/lib/entities";

const definitionCache = new Map<string, string>();

function EntityTerm({
  term,
  context,
  initialDefinition,
}: {
  term: string;
  context: string;
  initialDefinition?: string;
}) {
  const tooltipId = useId();
  const termRef = useRef<HTMLSpanElement>(null);
  const cacheKey = `${term}\u0000${context}`;
  const [tooltipShift, setTooltipShift] = useState(0);
  const [definition, setDefinition] = useState(initialDefinition ?? definitionCache.get(cacheKey) ?? "");
  const [requested, setRequested] = useState(Boolean(initialDefinition || definitionCache.has(cacheKey)));

  async function loadDefinition() {
    if (requested) return;
    setRequested(true);
    try {
      const parameters = new URLSearchParams({ term, context: context.slice(0, 500) });
      const response = await fetch(`/api/define?${parameters}`);
      if (!response.ok) throw new Error(`Definition lookup returned ${response.status}`);
      const data = (await response.json()) as { definition?: string };
      const nextDefinition = data.definition || `A reliable background match for “${term}” was not available. Use the surrounding article and linked source rather than assuming an identity.`;
      definitionCache.set(cacheKey, nextDefinition);
      setDefinition(nextDefinition);
    } catch {
      const fallback = `A reliable background match for “${term}” was not available. Use the surrounding article and linked source rather than assuming an identity.`;
      definitionCache.set(cacheKey, fallback);
      setDefinition(fallback);
    }
  }

  function showDefinition() {
    const rect = termRef.current?.getBoundingClientRect();
    if (rect) {
      const tooltipWidth = Math.min(330, window.innerWidth - 32);
      const naturalLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
      const safeLeft = Math.min(Math.max(naturalLeft, 16), window.innerWidth - tooltipWidth - 16);
      setTooltipShift(safeLeft - naturalLeft);
    }
    void loadDefinition();
  }

  return (
    <span
      ref={termRef}
      className="entity-term"
      data-entity-term={term}
      tabIndex={0}
      aria-label={term}
      aria-describedby={tooltipId}
      onMouseEnter={showDefinition}
      onFocus={showDefinition}
    >
      {term}
      <span
        className="entity-tooltip"
        id={tooltipId}
        role="tooltip"
        aria-live="polite"
        style={{ "--tooltip-shift": `${tooltipShift}px` } as CSSProperties}
      >
        {definition || "Loading a concise definition…"}
      </span>
    </span>
  );
}

export function EntityText({ text }: { text: string }) {
  return entityParts(text).map((part, index) =>
    part.entity ? (
      <EntityTerm
        key={`${part.text}-${index}`}
        term={part.text}
        context={text}
        initialDefinition={part.definition}
      />
    ) : (
      part.text
    ),
  );
}
