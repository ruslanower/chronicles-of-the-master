import { useMemo } from "react";

export function Particles({ mood }: { mood: "rain" | "embers" | "spores" | "none" }) {
  const dots = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i * 0.73) % 4,
        dur: 3 + ((i * 1.3) % 3),
        size: 2 + (i % 3) * 2,
      })),
    [],
  );
  if (mood === "none") return null;
  if (mood === "rain")
    return (
      <div
        className="pointer-events-none absolute inset-0 z-[2] animate-rain opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(105deg, transparent 0 18px, color-mix(in oklab, var(--parchment) 55%, transparent) 18px 19px, transparent 19px 40px)",
          backgroundSize: "40px 400px",
        }}
      />
    );
  const color = mood === "embers" ? "var(--gold)" : "var(--toxin)";
  return (
    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      {dots.map((d, i) => (
        <span
          key={i}
          className="absolute bottom-0 animate-float-up"
          style={{
            left: `${d.left}%`,
            width: d.size,
            height: d.size,
            background: color,
            boxShadow: `0 0 8px ${color}`,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.dur}s`,
          }}
        />
      ))}
    </div>
  );
}
