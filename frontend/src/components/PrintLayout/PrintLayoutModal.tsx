import { useEffect, useRef } from "react";

// North arrow inline SVG for the title block
function NorthArrowSvg({ angle }: { angle: number }) {
  const css = 90 - angle; // degrees, 0=up for CSS
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ transform: `rotate(${css}deg)` }}>
        <svg width="20" height="26" viewBox="0 0 18 24">
          <polygon points="9,2 16,22 9,17" fill="#222" />
          <polygon points="9,2 2,22 9,17" fill="#ccc" stroke="#444" strokeWidth="0.5" />
        </svg>
      </div>
      <span style={{ fontSize: 8, fontWeight: 700, color: "#222" }}>N</span>
    </div>
  );
}

interface Props {
  imageDataUrl: string;
  projectName: string;
  scaleLabel: string;
  northAngle?: number;
  onClose: () => void;
}

export function PrintLayoutModal({
  imageDataUrl,
  projectName,
  scaleLabel,
  northAngle,
  onClose,
}: Props) {
  const printStyleRef = useRef<HTMLStyleElement | null>(null);

  // Inject @media print styles so only the modal prints
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @media print {
        body > * { display: none !important; }
        .skad-print-root { display: flex !important; }
      }
    `;
    document.head.appendChild(style);
    printStyleRef.current = style;
    return () => {
      if (printStyleRef.current) document.head.removeChild(printStyleRef.current);
    };
  }, []);

  const today = new Date().toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    /* Backdrop */
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 12,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Toolbar row */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            padding: "7px 18px",
            background: "#0078d4",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          🖨 Print / Save PDF
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "7px 14px",
            background: "#555",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* A3 sheet — landscape 420×297 mm aspect ratio */}
      <div
        className="skad-print-root"
        style={{
          background: "#fff",
          width: "min(90vw, calc(80vh * 420 / 297))",
          aspectRatio: "420 / 297",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          border: "1px solid #999",
          overflow: "hidden",
        }}
      >
        {/* Floor plan area */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px 16px 8px",
            background: "#fafafa",
            overflow: "hidden",
          }}
        >
          <img
            src={imageDataUrl}
            alt="Floor plan"
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              imageRendering: "crisp-edges",
            }}
          />
        </div>

        {/* Title block — bottom strip */}
        <div
          style={{
            borderTop: "2px solid #222",
            display: "flex",
            height: 72,
            flexShrink: 0,
          }}
        >
          {/* Project name — largest cell */}
          <div
            style={{
              flex: 3,
              borderRight: "1px solid #aaa",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "4px 12px",
            }}
          >
            <span style={{ fontSize: 8, color: "#666", letterSpacing: 0.5 }}>PROJECT</span>
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "#111",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {projectName}
            </span>
          </div>

          {/* Scale */}
          <div
            style={{
              flex: 1,
              borderRight: "1px solid #aaa",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: 4,
            }}
          >
            <span style={{ fontSize: 8, color: "#666", letterSpacing: 0.5 }}>SCALE</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{scaleLabel}</span>
          </div>

          {/* Date */}
          <div
            style={{
              flex: 1,
              borderRight: "1px solid #aaa",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: 4,
            }}
          >
            <span style={{ fontSize: 8, color: "#666", letterSpacing: 0.5 }}>DATE</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#111" }}>{today}</span>
          </div>

          {/* North arrow */}
          <div
            style={{
              flex: 1,
              borderRight: "1px solid #aaa",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: 4,
            }}
          >
            <NorthArrowSvg angle={northAngle ?? 90} />
          </div>

          {/* Drawn by */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: 4,
            }}
          >
            <span style={{ fontSize: 8, color: "#666", letterSpacing: 0.5 }}>DRAWN BY</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>SKAD</span>
          </div>
        </div>
      </div>
    </div>
  );
}
