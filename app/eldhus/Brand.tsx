import { C } from "./theme";

const serif = { fontFamily: "var(--font-eldhus-serif)" } as const;

/**
 * SVO GOTT wordmark, optionally with the "svo gott / svo létt / svo rétt"
 * slang trio beside it in brand colors. Use onDark on the deep-teal footer.
 */
export function Wordmark({
  slang = false,
  size = "md",
  onDark = false,
}: {
  slang?: boolean;
  size?: "sm" | "md" | "lg";
  onDark?: boolean;
}) {
  const sz = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-xl";
  const svoColor = onDark ? "#fff" : C.deep;
  const trio: [string, string][] = [
    ["svo gott", C.red],
    ["svo létt", onDark ? C.teal : C.deep],
    ["svo rétt", onDark ? "#fff" : C.teal],
  ];
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`${sz} font-bold tracking-tight whitespace-nowrap`} style={{ ...serif, color: svoColor }}>
        SVO <span style={{ color: C.red }}>GOTT</span>
      </span>
      {slang && (
        <span className="flex flex-col leading-[1.15] text-[10px] font-bold lowercase tracking-wide">
          {trio.map(([word, color]) => (
            <span key={word} style={{ color }}>{word}</span>
          ))}
        </span>
      )}
    </span>
  );
}
