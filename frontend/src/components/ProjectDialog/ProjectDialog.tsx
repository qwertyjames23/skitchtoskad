import { useState, useEffect, useCallback } from "react";
import {
  apiCreateProject,
  apiListProjects,
  apiOpenProject,
} from "../../api/client";
import type { ProjectMetadata, ProjectInfo } from "../../api/client";

interface Props {
  mode: "new" | "open";
  onClose: () => void;
  onProjectCreated: (meta: ProjectMetadata, projectPath: string) => void;
  onProjectOpened: (meta: ProjectMetadata, script: string, projectPath: string) => void;
}

export function ProjectDialog({
  mode: initialMode,
  onClose,
  onProjectCreated,
  onProjectOpened,
}: Props) {
  const [mode, setMode] = useState<"new" | "open">(initialMode);

  // New project form
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [location, setLocation] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Open project list
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");

  // Load project list when on "open" tab
  useEffect(() => {
    if (mode !== "open") return;
    setLoadingList(true);
    setOpenError("");
    apiListProjects()
      .then((res) => setProjects(res.projects))
      .catch(() => setOpenError("Could not load project list."))
      .finally(() => setLoadingList(false));
  }, [mode]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleCreate = useCallback(async () => {
    if (!projectName.trim()) {
      setCreateError("Project name is required.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const res = await apiCreateProject({
        project_name: projectName.trim(),
        client_name: clientName.trim(),
        location: location.trim(),
      });
      onProjectCreated(res.metadata, res.project_path);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail;
      setCreateError(detail || "Failed to create project. Name may already exist.");
    } finally {
      setCreating(false);
    }
  }, [projectName, clientName, location, onProjectCreated]);

  const handleOpen = useCallback(
    async (projectPath: string) => {
      setOpening(projectPath);
      setOpenError("");
      try {
        const res = await apiOpenProject(projectPath);
        onProjectOpened(res.metadata, res.script, projectPath);
      } catch {
        setOpenError("Failed to open project.");
        setOpening(null);
      }
    },
    [onProjectOpened]
  );

  // ── Styles ────────────────────────────────────────────────────────────────
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "7px 20px",
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid #0078d4" : "2px solid transparent",
    color: active ? "#fff" : "#888",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: -1,
  });

  const actionBtn = (primary: boolean, disabled = false): React.CSSProperties => ({
    padding: "7px 20px",
    background: disabled
      ? primary ? "#005a9e" : "#333"
      : primary ? "#0078d4" : "#333",
    color: primary ? "#fff" : "#ccc",
    border: primary ? "none" : "1px solid #555",
    borderRadius: 4,
    cursor: disabled ? "wait" : "pointer",
    fontSize: 13,
    fontWeight: primary ? 600 : 400,
    opacity: disabled ? 0.8 : 1,
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#1e1e1e",
          border: "1px solid #444",
          borderRadius: 8,
          width: 460,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 0",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
            Project
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#888",
              fontSize: 18,
              cursor: "pointer",
              lineHeight: 1,
              padding: "0 2px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            padding: "10px 20px 0",
            borderBottom: "1px solid #333",
            flexShrink: 0,
          }}
        >
          <button type="button" style={tabBtn(mode === "new")} onClick={() => setMode("new")}>
            New Project
          </button>
          <button type="button" style={tabBtn(mode === "open")} onClick={() => setMode("open")}>
            Open Project
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {mode === "new" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field
                label="Project Name *"
                value={projectName}
                onChange={setProjectName}
                placeholder="e.g. Beach House Bohol"
                autoFocus
                onEnter={handleCreate}
              />
              <Field
                label="Client Name"
                value={clientName}
                onChange={setClientName}
                placeholder="e.g. Juan dela Cruz"
                onEnter={handleCreate}
              />
              <Field
                label="Location"
                value={location}
                onChange={setLocation}
                placeholder="e.g. Tagbilaran, Bohol"
                onEnter={handleCreate}
              />
              {createError && (
                <div style={{ color: "#e57373", fontSize: 12 }}>{createError}</div>
              )}
              <div style={{ color: "#666", fontSize: 11, marginTop: -4 }}>
                Project will be saved in Documents/SKAD_Projects/
              </div>
            </div>
          ) : (
            <div>
              {loadingList && (
                <div style={{ color: "#888", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
                  Loading projects…
                </div>
              )}
              {!loadingList && openError && (
                <div style={{ color: "#e57373", fontSize: 12 }}>{openError}</div>
              )}
              {!loadingList && !openError && projects.length === 0 && (
                <div style={{ color: "#666", fontSize: 13, textAlign: "center", padding: "28px 0" }}>
                  No projects found in Documents/SKAD_Projects
                </div>
              )}
              {projects.map((p) => (
                <ProjectRow
                  key={p.project_path}
                  project={p}
                  busy={opening !== null}
                  isOpening={opening === p.project_path}
                  onOpen={handleOpen}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {mode === "new" && (
          <div
            style={{
              padding: "14px 20px",
              borderTop: "1px solid #333",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <button type="button" onClick={onClose} style={actionBtn(false)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              style={actionBtn(true, creating)}
            >
              {creating ? "Creating…" : "Create Project"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <div>
      <label
        style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 5 }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
        style={{
          width: "100%",
          padding: "8px 10px",
          boxSizing: "border-box",
          background: "#2a2a2a",
          color: "#fff",
          border: "1px solid #444",
          borderRadius: 4,
          fontSize: 13,
          outline: "none",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "#0078d4"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "#444"; }}
      />
    </div>
  );
}

function ProjectRow({
  project,
  busy,
  isOpening,
  onOpen,
}: {
  project: ProjectInfo;
  busy: boolean;
  isOpening: boolean;
  onOpen: (path: string) => void;
}) {
  const subtitle = [project.client_name, project.location]
    .filter(Boolean)
    .join(" · ");
  const date = project.last_modified ? project.last_modified.slice(0, 10) : "";

  return (
    <button
      type="button"
      onClick={() => onOpen(project.project_path)}
      disabled={busy}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        marginBottom: 6,
        background: isOpening ? "#1a2e1a" : "#252525",
        border: "1px solid #3a3a3a",
        borderRadius: 6,
        cursor: busy ? "wait" : "pointer",
        color: "#e0e0e0",
      }}
      onMouseEnter={(e) => {
        if (!busy) (e.currentTarget as HTMLButtonElement).style.background = "#2e2e2e";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          isOpening ? "#1a2e1a" : "#252525";
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13 }}>
        📁 {project.project_name}
        {isOpening && (
          <span style={{ marginLeft: 8, color: "#888", fontWeight: 400, fontSize: 11 }}>
            Opening…
          </span>
        )}
      </div>
      {(subtitle || date) && (
        <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>
          {[subtitle, date].filter(Boolean).join(" · ")}
        </div>
      )}
    </button>
  );
}
