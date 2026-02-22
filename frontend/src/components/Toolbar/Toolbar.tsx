import { useRef, useState } from "react";

interface Props {
  onGenerate: () => void;
  onExportDxf: () => void;
  loading: boolean;
  appMode: "plan" | "script" | "3d";
  onModeChange: (mode: "plan" | "script" | "3d") => void;
  planViewState?: "editing" | "generated";
  onBackToEdit?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  showDimensions?: boolean;
  onToggleDimensions?: () => void;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onPresent: () => void;
  onSave: () => void;
  onLoad: (file: File) => void;
}

export function Toolbar({
  onGenerate,
  onExportDxf,
  loading,
  appMode,
  onModeChange,
  planViewState,
  onBackToEdit,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  showDimensions,
  onToggleDimensions,
  projectName,
  onProjectNameChange,
  onPresent,
  onSave,
  onLoad,
}: Props) {
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tabBase: React.CSSProperties = {
    padding: "5px 16px",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    transition: "background 0.15s",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        background: "#2d2d2d",
        borderBottom: "1px solid #444",
        flexShrink: 0,
        position: "relative",
      }}
    >
      <span
        style={{
          color: "#fff",
          fontWeight: 700,
          fontSize: 16,
          marginRight: 8,
          flexShrink: 0,
        }}
      >
        SKAD
      </span>

      {/* Mode tabs */}
      <div
        style={{
          display: "flex",
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid #555",
          marginRight: 8,
        }}
      >
        <button
          type="button"
          onClick={() => onModeChange("plan")}
          style={{
            ...tabBase,
            background: appMode === "plan" ? "#0078d4" : "transparent",
          }}
        >
          Plan
        </button>
        <button
          type="button"
          onClick={() => onModeChange("script")}
          style={{
            ...tabBase,
            background: appMode === "script" ? "#0078d4" : "transparent",
          }}
        >
          Script
        </button>
        <button
          type="button"
          onClick={() => onModeChange("3d")}
          style={{
            ...tabBase,
            background: appMode === "3d" ? "#7b2fbe" : "transparent",
          }}
        >
          3D
        </button>
      </div>

      {/* Back to Edit — only in Plan mode after generating */}
      {appMode === "plan" && planViewState === "generated" && onBackToEdit && (
        <button
          type="button"
          onClick={onBackToEdit}
          style={{
            padding: "5px 12px",
            background: "#444",
            color: "#fff",
            border: "1px solid #666",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          ← Back to Edit
        </button>
      )}

      {/* Undo / Redo — only in Plan mode while editing */}
      {appMode === "plan" && planViewState !== "generated" && (
        <>
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            style={{
              padding: "5px 10px",
              background: canUndo ? "#444" : "#333",
              color: canUndo ? "#fff" : "#777",
              border: "1px solid #666",
              borderRadius: 4,
              cursor: canUndo ? "pointer" : "default",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            ↩ Undo
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            style={{
              padding: "5px 10px",
              background: canRedo ? "#444" : "#333",
              color: canRedo ? "#fff" : "#777",
              border: "1px solid #666",
              borderRadius: 4,
              cursor: canRedo ? "pointer" : "default",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            ↪ Redo
          </button>
        </>
      )}

      {/* Dimensions toggle — hidden in 3D mode */}
      {appMode !== "3d" && (
        <button
          type="button"
          onClick={onToggleDimensions}
          title="Toggle dimension labels"
          style={{
            padding: "5px 10px",
            background: showDimensions ? "#0078d4" : "#444",
            color: "#fff",
            border: "1px solid #666",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          ⬌ Dims
        </button>
      )}

      {/* Center: editable project name */}
      {editingName ? (
        <input
          ref={nameInputRef}
          aria-label="Project name"
          defaultValue={projectName}
          autoFocus
          onBlur={(e) => {
            onProjectNameChange(e.target.value.trim() || projectName);
            setEditingName(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onProjectNameChange((e.target as HTMLInputElement).value.trim() || projectName);
              setEditingName(false);
            } else if (e.key === "Escape") {
              setEditingName(false);
            }
          }}
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#3a3a3a",
            color: "#fff",
            border: "1px solid #0078d4",
            borderRadius: 4,
            padding: "3px 10px",
            fontSize: 13,
            fontWeight: 600,
            textAlign: "center",
            outline: "none",
            width: 200,
          }}
        />
      ) : (
        <span
          onClick={() => setEditingName(true)}
          title="Click to rename project"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            color: "#ccc",
            fontSize: 13,
            fontWeight: 600,
            cursor: "text",
            userSelect: "none",
            whiteSpace: "nowrap",
            padding: "3px 8px",
            borderRadius: 4,
            border: "1px solid transparent",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "#555";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "transparent";
          }}
        >
          {projectName}
        </span>
      )}

      <button
        type="button"
        onClick={onGenerate}
        disabled={loading}
        style={{
          padding: "6px 16px",
          background: "#0078d4",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: loading ? "wait" : "pointer",
          fontSize: 13,
          fontWeight: 600,
          marginLeft: "auto",
        }}
      >
        {loading ? "Generating..." : "Generate"}
      </button>
      <button
        type="button"
        onClick={onExportDxf}
        disabled={loading}
        style={{
          padding: "6px 16px",
          background: "#107c10",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Export DXF
      </button>
      <button
        type="button"
        onClick={onSave}
        title="Save project as .skad file"
        style={{
          padding: "6px 14px",
          background: "#444",
          color: "#fff",
          border: "1px solid #666",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        title="Load a .skad project file"
        style={{
          padding: "6px 14px",
          background: "#444",
          color: "#fff",
          border: "1px solid #666",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Load
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".skad"
        aria-label="Load .skad project file"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onLoad(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={onPresent}
        title="Client Presentation Mode"
        style={{
          padding: "6px 14px",
          background: "#5c3d8f",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        ▶ Present
      </button>
    </div>
  );
}
