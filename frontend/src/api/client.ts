import axios from "axios";
import type { FloorPlanResponse } from "../types/plan";

const api = axios.create({
  baseURL: "/api",
  timeout: 30000,
});

export async function generateFromScript(
  script: string,
  unit = "mm"
): Promise<FloorPlanResponse> {
  const res = await api.post<FloorPlanResponse>("/generate/from-script", {
    script,
    unit,
  });
  return res.data;
}

export async function generateFromCoords(
  data: Record<string, unknown>
): Promise<FloorPlanResponse> {
  const res = await api.post<FloorPlanResponse>("/generate/from-coords", data);
  return res.data;
}

export async function parseScript(script: string, unit = "mm") {
  const res = await api.post("/parse", { script, unit });
  return res.data;
}

export async function exportDxfFromScript(
  script: string,
  unit = "mm"
): Promise<Blob> {
  const res = await api.post("/export/dxf/from-script", { script, unit }, {
    responseType: "blob",
  });
  return res.data;
}

export async function exportIfcFromScript(
  script: string,
  unit = "mm"
): Promise<Blob> {
  const res = await api.post("/export/ifc/from-script", { script, unit }, {
    responseType: "blob",
  });
  return res.data;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function saveScriptFile(script: string, projectName: string) {
  const data = {
    version: "1.0",
    projectName,
    script,
    savedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const safeName = projectName.replace(/[^a-zA-Z0-9_\- ]/g, "_");
  downloadBlob(blob, `${safeName}.skad`);
}

export async function loadScriptFile(
  file: File
): Promise<{ script: string; projectName: string }> {
  const text = await file.text();
  const data = JSON.parse(text) as Record<string, unknown>;
  if (typeof data.script !== "string") throw new Error("Invalid .skad file");
  return {
    script: data.script,
    projectName: typeof data.projectName === "string" ? data.projectName : "Floor Plan",
  };
}

// ── Project system ────────────────────────────────────────────────────────────

export interface ProjectMetadata {
  project_name: string;
  client_name: string;
  location: string;
  created_at: string;
  last_modified: string;
}

export interface ProjectInfo {
  project_path: string;
  project_name: string;
  client_name: string;
  location: string;
  last_modified: string;
}

export async function apiCreateProject(data: {
  project_name: string;
  client_name?: string;
  location?: string;
}): Promise<{ project_path: string; metadata: ProjectMetadata }> {
  const res = await api.post("/project/new", data);
  return res.data;
}

export async function apiListProjects(): Promise<{ projects: ProjectInfo[] }> {
  const res = await api.get("/project/list");
  return res.data;
}

export async function apiOpenProject(
  project_path: string
): Promise<{ metadata: ProjectMetadata; script: string }> {
  const res = await api.post("/project/open", { project_path });
  return res.data;
}

export async function apiSaveScriptToProject(
  script: string
): Promise<{ ok: boolean; last_modified: string }> {
  const res = await api.post("/project/save-script", { script });
  return res.data;
}
