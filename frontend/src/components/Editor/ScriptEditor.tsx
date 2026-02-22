import { useRef, useEffect } from "react";
import type { ParseError } from "../../types/plan";

interface Props {
  value: string;
  onChange: (value: string) => void;
  errors: ParseError[];
}

export function ScriptEditor({ value, onChange, errors }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Auto-resize textarea to content
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.max(400, el.scrollHeight) + "px";
    }
  }, [value]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "8px 12px",
          background: "#1e1e1e",
          color: "#ccc",
          fontSize: 12,
          fontFamily: "monospace",
          borderBottom: "1px solid #333",
        }}
      >
        SKAD Script Editor
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          padding: "12px",
          fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
          fontSize: 13,
          lineHeight: 1.6,
          background: "#1e1e1e",
          color: "#d4d4d4",
          border: "none",
          outline: "none",
          resize: "none",
          tabSize: 4,
          whiteSpace: "pre",
          overflowX: "auto",
        }}
      />
      {errors.length > 0 && (
        <div
          style={{
            padding: "8px 12px",
            background: "#3c1111",
            borderTop: "1px solid #ff4444",
            maxHeight: 120,
            overflowY: "auto",
          }}
        >
          {errors.map((err, i) => (
            <div
              key={i}
              style={{
                color: "#ff6666",
                fontSize: 12,
                fontFamily: "monospace",
                padding: "2px 0",
              }}
            >
              {err.line > 0 ? `Line ${err.line}: ` : ""}
              {err.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
