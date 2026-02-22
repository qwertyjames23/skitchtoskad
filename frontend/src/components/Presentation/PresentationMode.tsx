import { useEffect, useRef, useState } from "react";
import { FloorPlanCanvas } from "../Canvas/FloorPlanCanvas";
import { ThreeDView } from "../ThreeD/ThreeDView";
import type { FloorPlanResponse } from "../../types/plan";
import type { View3DSettings } from "../../types/view3d";

interface Props {
  plan: FloorPlanResponse | null;
  view: "2d" | "3d";
  onViewChange: (v: "2d" | "3d") => void;
  onExit: () => void;
  projectName: string;
  view3dSettings: View3DSettings;
  onSettingsChange: (patch: Partial<View3DSettings>) => void;
}

export function PresentationMode({
  plan,
  view,
  onViewChange,
  onExit,
  projectName,
  view3dSettings,
  onSettingsChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  // Track canvas container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Escape key to exit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onExit]);

  const lot = plan?.lot;
  const toM = (mm: number) => (mm / 1000).toFixed(1) + "m";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "#111",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: 44,
          background: "#1c1c1e",
          borderBottom: "1px solid #333",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          flexShrink: 0,
          position: "relative",
        }}
      >
        {/* Left: 2D / 3D toggle */}
        <div
          style={{
            display: "flex",
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid #444",
          }}
        >
          {(["2d", "3d"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              disabled={v === "3d" && !plan}
              style={{
                padding: "4px 16px",
                border: "none",
                background: view === v ? "#0078d4" : "transparent",
                color: v === "3d" && !plan ? "#555" : "#fff",
                cursor: v === "3d" && !plan ? "default" : "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Center: project name */}
        <span
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: 0.5,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          {projectName}
        </span>

        {/* Right: Exit */}
        <button
          type="button"
          onClick={onExit}
          title="Exit Presentation (Esc)"
          style={{
            padding: "5px 14px",
            background: "rgba(255,69,58,0.12)",
            color: "#ff453a",
            border: "1px solid rgba(255,69,58,0.35)",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          ✕ Exit
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: "hidden", position: "relative" }}
      >
        {view === "2d" ? (
          <FloorPlanCanvas
            plan={plan}
            width={size.width}
            height={size.height}
            showDimensions={false}
          />
        ) : (
          <ThreeDView
            plan={plan}
            width={size.width}
            height={size.height}
            settings={view3dSettings}
            onSettingsChange={onSettingsChange}
          />
        )}

        {/* Lot info overlay — bottom-right, 2D only */}
        {lot && view === "2d" && (
          <div
            style={{
              position: "absolute",
              bottom: 20,
              right: 20,
              background: "rgba(0,0,0,0.65)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              borderRadius: 8,
              padding: "12px 16px",
              color: "#fff",
              fontSize: 12,
              lineHeight: 1.8,
              minWidth: 160,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                marginBottom: 4,
                color: "#888",
                textTransform: "uppercase",
                fontSize: 10,
                letterSpacing: 1,
              }}
            >
              Lot Info
            </div>
            <div>
              <span style={{ color: "#aaa" }}>Area: </span>
              <span style={{ fontWeight: 600 }}>{lot.area_sq_m.toFixed(1)} m²</span>
            </div>
            {lot.setbacks && (
              <>
                <div>
                  <span style={{ color: "#aaa" }}>Front: </span>
                  {toM(lot.setbacks.front)}
                </div>
                <div>
                  <span style={{ color: "#aaa" }}>Rear: </span>
                  {toM(lot.setbacks.rear)}
                </div>
                <div>
                  <span style={{ color: "#aaa" }}>Side: </span>
                  {toM(lot.setbacks.left)} / {toM(lot.setbacks.right)}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
