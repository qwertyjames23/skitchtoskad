import React, { useRef, useState, useEffect, useCallback } from "react";
import type { ScriptTemplate } from "../../data/scriptTemplates";
import { SCRIPT_TEMPLATES } from "../../data/scriptTemplates";

interface Props {
  onGenerate: () => void;
  onExportDxf: () => void;
  onExportPng?: () => void;
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
  onLoadTemplate?: (script: string) => void;
  onPrint?: () => void;
  onExportIfc?: () => void;
  exportLoading?: "dxf" | "ifc" | null;
  activeProject?: { project_name: string } | null;
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onSaveToProject?: () => void;
  projectSaving?: boolean;
}

type OpenMenu = "templates" | "project" | "export" | "output" | null;

export function Toolbar({
  onGenerate,
  onExportDxf,
  onExportPng,
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
  onLoadTemplate,
  onPrint,
  onExportIfc,
  exportLoading,
  activeProject,
  onNewProject,
  onOpenProject,
  onSaveToProject,
  projectSaving,
}: Props) {
  const [editingName, setEditingName] = useState(false);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close any open dropdown when clicking outside its container
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openMenu]);

  const toggle = useCallback((menu: OpenMenu) => {
    setOpenMenu((prev) => (prev === menu ? null : menu));
  }, []);

  const closeMenu = useCallback(() => setOpenMenu(null), []);

  const tabBase: React.CSSProperties = {
    padding: "5px 16px",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    transition: "background 0.15s",
  };

  const exportBusy = !!exportLoading;

  // Export dropdown trigger label — shows inline spinner while exporting
  const exportLabel: React.ReactNode = exportLoading ? (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 10, height: 10,
          border: "2px solid #fff", borderTopColor: "transparent",
          borderRadius: "50%", display: "inline-block",
          animation: "spin 0.7s linear infinite",
        }}
      />
      {exportLoading === "dxf" ? "DXF…" : "IFC…"}
    </span>
  ) : "Export ▾";

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
      {/* Logo */}
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
          style={{ ...tabBase, background: appMode === "plan" ? "#0078d4" : "transparent" }}
        >
          Plan
        </button>
        <button
          type="button"
          onClick={() => onModeChange("script")}
          style={{ ...tabBase, background: appMode === "script" ? "#0078d4" : "transparent" }}
        >
          Script
        </button>
        <button
          type="button"
          onClick={() => onModeChange("3d")}
          style={{ ...tabBase, background: appMode === "3d" ? "#7b2fbe" : "transparent" }}
        >
          3D
        </button>
      </div>

      {/* Templates ▾ */}
      {onLoadTemplate && (
        <ToolbarDropdown
          label="Templates ▾"
          open={openMenu === "templates"}
          onToggle={() => toggle("templates")}
          triggerStyle={{ background: openMenu === "templates" ? "#0078d4" : "#444" }}
          panelAlign="left"
          minWidth={220}
        >
          {SCRIPT_TEMPLATES.map((tpl: ScriptTemplate) => (
            <DropdownItem
              key={tpl.name}
              onClick={() => { onLoadTemplate(tpl.script); closeMenu(); }}
            >
              <div>{tpl.name}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{tpl.description}</div>
            </DropdownItem>
          ))}
        </ToolbarDropdown>
      )}

      {/* ← Back to Edit — Plan mode after generating */}
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

      {/* Undo / Redo — Plan mode while editing */}
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

      {/* Project ▾ — file management hub */}
      <ToolbarDropdown
        label="Project ▾"
        open={openMenu === "project"}
        onToggle={() => toggle("project")}
        triggerStyle={{ background: "#1a5276", border: "1px solid #2e86c1" }}
        panelAlign="left"
      >
        {onNewProject && (
          <DropdownItem onClick={() => { onNewProject(); closeMenu(); }}>
            📄 New Project
          </DropdownItem>
        )}
        {onOpenProject && (
          <DropdownItem onClick={() => { onOpenProject(); closeMenu(); }}>
            📂 Open Project
          </DropdownItem>
        )}
        {onSaveToProject && (
          <DropdownItem
            onClick={() => { onSaveToProject(); closeMenu(); }}
            disabled={projectSaving || !activeProject}
          >
            {projectSaving ? "💾 Saving…" : "💾 Save to Project"}
          </DropdownItem>
        )}
        <DropdownSep />
        <DropdownItem onClick={() => { onSave(); closeMenu(); }}>
          ↓ Save .skad
        </DropdownItem>
        <DropdownItem onClick={() => { fileInputRef.current?.click(); closeMenu(); }}>
          ↑ Load .skad
        </DropdownItem>
      </ToolbarDropdown>

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

      {/* Generate — standalone primary button */}
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

      {/* Export ▾ — DXF / IFC / PNG */}
      <ToolbarDropdown
        label={exportLabel}
        open={openMenu === "export" && !exportBusy}
        onToggle={() => { if (!exportBusy) toggle("export"); }}
        triggerStyle={{
          background: exportBusy ? "#0a5c0a" : "#107c10",
          border: "none",
          cursor: exportBusy ? "wait" : "pointer",
        }}
        panelAlign="right"
      >
        <DropdownItem
          onClick={() => { onExportDxf(); closeMenu(); }}
          disabled={exportBusy}
        >
          {exportLoading === "dxf" ? "Exporting DXF…" : "Export DXF"}
        </DropdownItem>
        {onExportIfc && (
          <DropdownItem
            onClick={() => { onExportIfc(); closeMenu(); }}
            disabled={exportBusy}
          >
            {exportLoading === "ifc" ? "Exporting IFC…" : "Export IFC"}
          </DropdownItem>
        )}
        {onExportPng && (
          <DropdownItem onClick={() => { onExportPng(); closeMenu(); }}>
            Export PNG
          </DropdownItem>
        )}
      </ToolbarDropdown>

      {/* Output ▾ — Print / Present */}
      <ToolbarDropdown
        label="Output ▾"
        open={openMenu === "output"}
        onToggle={() => toggle("output")}
        triggerStyle={{ background: "#5c3d8f", border: "none" }}
        panelAlign="right"
      >
        {onPrint && (
          <DropdownItem onClick={() => { onPrint(); closeMenu(); }}>
            🖨 Print
          </DropdownItem>
        )}
        <DropdownItem onClick={() => { onPresent(); closeMenu(); }}>
          ▶ Present
        </DropdownItem>
      </ToolbarDropdown>

      {/* Hidden file input for Load .skad */}
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
    </div>
  );
}

// ── Shared dropdown primitives ────────────────────────────────────────────────

function ToolbarDropdown({
  label,
  open,
  onToggle,
  children,
  triggerStyle,
  panelAlign = "left",
  minWidth = 180,
}: {
  label: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  triggerStyle?: React.CSSProperties;
  panelAlign?: "left" | "right";
  minWidth?: number;
}) {
  return (
    <div
      style={{ position: "relative", flexShrink: 0 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          padding: "5px 12px",
          color: "#fff",
          border: "1px solid #666",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 4,
          ...triggerStyle,
        }}
      >
        {label}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            ...(panelAlign === "right" ? { right: 0 } : { left: 0 }),
            marginTop: 4,
            background: "#2a2a2a",
            border: "1px solid #555",
            borderRadius: 6,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            zIndex: 200,
            minWidth,
            overflow: "hidden",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: "block",
        width: "100%",
        padding: "9px 14px",
        background: "transparent",
        color: disabled ? "#555" : "#e0e0e0",
        border: "none",
        borderBottom: "1px solid #3a3a3a",
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
        fontSize: 13,
        fontWeight: 500,
      }}
      onMouseEnter={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLButtonElement).style.background = "#3a3a3a";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function DropdownSep() {
  return <div style={{ height: 1, background: "#3a3a3a", margin: "3px 0" }} />;
}
