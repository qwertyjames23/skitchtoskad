import { useRef, useEffect, useMemo } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
} from "@codemirror/view";
import { StreamLanguage } from "@codemirror/language";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { lintGutter, linter, forceLinting } from "@codemirror/lint";
import type { Diagnostic } from "@codemirror/lint";
import type { ParseError } from "../../types/plan";

// ── SKAD language definition ────────────────────────────────────────────────

const KEYWORDS = new Set([
  "WALL", "DOOR", "WINDOW", "ROOM", "LABEL", "FLOOR", "FURNITURE",
  "LOT", "SETBACK", "NORTH", "UNIT", "THICK", "SWING", "SILL",
  "HEIGHT", "COLOR", "ROT",
]);

const DIRECTION_WORDS = new Set(["left", "right", "double", "mm", "m"]);

const skadLanguage = StreamLanguage.define({
  startState: () => ({}),
  token(stream) {
    if (stream.eatSpace()) return null;

    // Hex color #rrggbb — must appear before the comment rule
    if (stream.match(/^#[0-9a-fA-F]{6}/)) return "atom";

    // Line comment: # not followed by 6 hex digits
    if (stream.eat("#")) {
      stream.skipToEnd();
      return "comment";
    }

    // Quoted string
    if (stream.match(/^"[^"]*"/)) return "string";

    // Arrow operator
    if (stream.match(/^->/)) return "operator";

    // Number (int or float)
    if (stream.match(/^-?\d+(?:\.\d+)?/)) return "number";

    // Identifier / keyword
    if (stream.match(/^[A-Za-z][A-Za-z0-9_-]*/)) {
      const word = stream.current();
      if (KEYWORDS.has(word)) return "keyword";
      if (DIRECTION_WORDS.has(word)) return "builtin";
      return null;
    }

    // Coordinate punctuation ( , )
    if (stream.match(/^[(),]/)) return "meta";

    // Consume one unrecognised character
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "#" } },
});

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (value: string) => void;
  errors: ParseError[];
}

export function ScriptEditor({ value, onChange, errors }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const errorsRef = useRef<ParseError[]>(errors);

  // Keep errorsRef current and re-lint when errors change
  useEffect(() => {
    errorsRef.current = errors;
    if (viewRef.current) forceLinting(viewRef.current);
  }, [errors]);

  // Linter reads from errorsRef — stable reference across renders
  const linterExt = useMemo(
    () =>
      linter((view): Diagnostic[] => {
        return errorsRef.current
          .filter((err) => err.line > 0)
          .flatMap((err) => {
            try {
              const line = view.state.doc.line(err.line);
              return [
                {
                  from: line.from,
                  to: line.to || line.from + 1,
                  severity: "error" as const,
                  message: err.message,
                },
              ];
            } catch {
              return [];
            }
          });
      }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Create editor once
  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          lineNumbers(),
          drawSelection(),
          highlightActiveLine(),
          skadLanguage,
          oneDark,
          lintGutter(),
          linterExt,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChange(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            "&": { height: "100%", fontSize: "13px" },
            ".cm-scroller": {
              fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
              overflow: "auto",
            },
            ".cm-content": { padding: "8px 0" },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external value changes (e.g. template load)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
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
          flexShrink: 0,
        }}
      >
        SKAD Script Editor
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: "hidden", minHeight: 0 }} />
      {errors.length > 0 && (
        <div
          style={{
            padding: "8px 12px",
            background: "#3c1111",
            borderTop: "1px solid #ff4444",
            maxHeight: 120,
            overflowY: "auto",
            flexShrink: 0,
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
