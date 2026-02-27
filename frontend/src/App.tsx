import { useState, useEffect, useRef, useCallback } from "react";
import type Konva from "konva";
import { FloorPlanCanvas } from "./components/Canvas/FloorPlanCanvas";
import { ScriptEditor } from "./components/Editor/ScriptEditor";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { PropertiesPanel } from "./components/PropertiesPanel/PropertiesPanel";
import { PlanModeLeft } from "./components/PlanMode/PlanModeLeft";
import { PlanModeCanvas } from "./components/PlanMode/PlanModeCanvas";
import { PlanModeInspector } from "./components/PlanMode/PlanModeInspector";
import { usePlanState } from "./hooks/usePlanState";
import {
  usePlanModeState,
  planStateToScript,
  parseScriptToPlanState,
} from "./hooks/usePlanModeState";
import { ThreeDView } from "./components/ThreeD/ThreeDView";
import type { ThreeDCaptureHandle } from "./components/ThreeD/ThreeDView";
import { PresentationMode } from "./components/Presentation/PresentationMode";
import { PrintLayoutModal } from "./components/PrintLayout/PrintLayoutModal";
import {
  saveScriptFile, loadScriptFile, exportIfcFromScript, downloadBlob,
  apiSaveScriptToProject,
} from "./api/client";
import type { ProjectMetadata } from "./api/client";
import { ProjectDialog } from "./components/ProjectDialog/ProjectDialog";
import type { ToolType, SelectedElement, GridSnapMm } from "./types/planMode";
import type { View3DSettings } from "./types/view3d";
import { DEFAULT_VIEW3D_SETTINGS } from "./types/view3d";

type EditorMode = "normal" | "collapsed" | "maximized";

const EDITOR_WIDTH: Record<EditorMode, string | number> = {
  normal:    "25%",
  collapsed: 28,
  maximized: "55%",
};
const EDITOR_MIN_WIDTH: Record<EditorMode, number> = {
  normal:    280,
  collapsed: 28,
  maximized: 480,
};

export default function App() {
  // ── Script mode ──────────────────────────────────────────────────────────
  const {
    script, setScript,
    plan: scriptPlan,
    errors: scriptErrors,
    loading: scriptLoading,
    generate: scriptGenerate,
    syncGenerated: syncScriptGenerated,
    exportDxf: scriptExportDxf,
  } = usePlanState();

  // ── Plan mode ────────────────────────────────────────────────────────────
  const {
    planState,
    plan: planGenResult,
    generatedScript,
    errors: planErrors,
    loading: planLoading,
    setLot, setSetbacks,
    addWall, addWalls, addDoor, addWindow, addLabel,
    deleteElement,
    updateWall, updateDoor, updateWindow, updateLabel,
    generate: planGenerate,
    syncGenerated: syncPlanGenerated,
    exportDxf: planExportDxf,
    canUndo,
    canRedo,
    undo,
    redo,
    initFromScript,
  } = usePlanModeState();

  // ── App mode ─────────────────────────────────────────────────────────────
  const [appMode, setAppMode] = useState<"plan" | "script" | "3d">("script");
  const [planViewState, setPlanViewState] = useState<"editing" | "generated">("editing");
  const [view3dSettings, setView3dSettings] = useState<View3DSettings>(DEFAULT_VIEW3D_SETTINGS);

  // ── Presentation mode ────────────────────────────────────────────────────
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [presentationView, setPresentationView] = useState<"2d" | "3d">("2d");
  const [projectName, setProjectName] = useState("Floor Plan");

  // ── Script mode layout state ─────────────────────────────────────────────
  const [editorMode, setEditorMode] = useState<EditorMode>("normal");
  const [propsCollapsed, setPropsCollapsed] = useState(false);

  // ── Plan mode tool state ─────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [selectedElement, setSelectedElement] = useState<SelectedElement>(null);
  const [gridSnap, setGridSnap] = useState<GridSnapMm>(500);
  const [showDimensions, setShowDimensions] = useState(false);
  const [wallThickness, setWallThickness] = useState(200);
  const [doorSwing, setDoorSwing] = useState<"left" | "right" | "double">("left");
  const [windowHeight, setWindowHeight] = useState(1200);
  const [labelText, setLabelText] = useState("Room");

  // ── Canvas size via ResizeObserver ───────────────────────────────────────
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // ── PNG export refs ───────────────────────────────────────────────────────
  const floorPlanStageRef = useRef<Konva.Stage | null>(null);
  const threeDCaptureRef = useRef<ThreeDCaptureHandle | null>(null);

  // ── Print modal ───────────────────────────────────────────────────────────
  const [showPrint, setShowPrint] = useState(false);
  const [printImageUrl, setPrintImageUrl] = useState<string | null>(null);

  // ── Floor levels ──────────────────────────────────────────────────────────
  const [activeFloor, setActiveFloor] = useState(1);

  // ── Export loading state ──────────────────────────────────────────────────
  const [exportLoading, setExportLoading] = useState<"dxf" | "ifc" | null>(null);

  // ── Project system ────────────────────────────────────────────────────────
  const [activeProject, setActiveProject] = useState<{ project_name: string; project_path: string } | null>(null);
  const [projectDialogMode, setProjectDialogMode] = useState<"new" | "open" | null>(null);
  const [projectSaving, setProjectSaving] = useState(false);

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  // Re-run whenever the center div changes (mode switch mounts a different div)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appMode, planViewState]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleModeChange = useCallback(
    (mode: "plan" | "script" | "3d") => {
      if (mode === "script") {
        // Always serialize Plan mode → Script when switching to Script tab,
        // so manual edits in Plan mode are reflected immediately.
        if (planState.lot !== null) {
          setScript(planStateToScript(planState));
        } else if (generatedScript) {
          setScript(generatedScript);
        }
        // If Plan mode was never used (no lot), keep the existing script.
      }
      if (mode === "plan") {
        // Always start in editing state; the render function decides whether
        // to show the script-plan preview based on current live state.
        setPlanViewState("editing");
      }
      setAppMode(mode);
    },
    [generatedScript, planState, setScript]
  );

  const handlePlanGenerate = useCallback(async () => {
    const generated = await planGenerate();
    if (!generated) return;
    syncScriptGenerated(generated.script, generated.plan);
    setPlanViewState("generated");
  }, [planGenerate, syncScriptGenerated]);

  const handleScriptGenerate = useCallback(async () => {
    const generatedPlan = await scriptGenerate();
    if (!generatedPlan) return;
    initFromScript(parseScriptToPlanState(script));
    syncPlanGenerated(script, generatedPlan);
    setPlanViewState("generated");
  }, [initFromScript, script, scriptGenerate, syncPlanGenerated]);

  const handleBackToEdit = useCallback(() => setPlanViewState("editing"), []);

  const handleActivateTool = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    setSelectedElement(null);
  }, []);

  const handleUpdate3DSettings = useCallback((patch: Partial<View3DSettings>) => {
    setView3dSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSave = useCallback(() => {
    saveScriptFile(script, projectName);
  }, [script, projectName]);

  const handleLoad = useCallback(async (file: File) => {
    const { script: loaded, projectName: name } = await loadScriptFile(file);
    setScript(loaded);
    setProjectName(name);
  }, [setScript]);

  const handleExportPng = useCallback(() => {
    const filename = `${projectName.replace(/\s+/g, "_")}.png`;
    if (appMode === "3d") {
      const dataUrl = threeDCaptureRef.current?.capture();
      if (!dataUrl) return;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      a.click();
    } else {
      const dataUrl = floorPlanStageRef.current?.toDataURL({ pixelRatio: 2 });
      if (!dataUrl) return;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      a.click();
    }
  }, [appMode, projectName]);

  const handlePrint = useCallback(() => {
    const dataUrl = floorPlanStageRef.current?.toDataURL({ pixelRatio: 3 });
    if (!dataUrl) return;
    setPrintImageUrl(dataUrl);
    setShowPrint(true);
  }, []);

  const handleExportDxf = useCallback(async () => {
    setExportLoading("dxf");
    try {
      if (appMode === "plan") await planExportDxf();
      else await scriptExportDxf();
    } finally {
      setExportLoading(null);
    }
  }, [appMode, planExportDxf, scriptExportDxf]);

  const handleExportIfc = useCallback(async () => {
    const src = appMode === "plan" ? generatedScript || script : script;
    if (!src?.trim()) return;
    setExportLoading("ifc");
    try {
      const blob = await exportIfcFromScript(src);
      downloadBlob(blob, `${projectName.replace(/\s+/g, "_")}.ifc`);
    } catch {
      // silently ignore — backend errors will show in generate errors
    } finally {
      setExportLoading(null);
    }
  }, [appMode, generatedScript, script, projectName]);

  // ── Project handlers ─────────────────────────────────────────────────────
  const handleProjectCreated = useCallback((meta: ProjectMetadata, projectPath: string) => {
    setActiveProject({ project_name: meta.project_name, project_path: projectPath });
    setProjectName(meta.project_name);
    setProjectDialogMode(null);
  }, []);

  const handleProjectOpened = useCallback((meta: ProjectMetadata, loadedScript: string, projectPath: string) => {
    setActiveProject({ project_name: meta.project_name, project_path: projectPath });
    setProjectName(meta.project_name);
    setScript(loadedScript);
    setProjectDialogMode(null);
  }, [setScript]);

  const handleSaveToProject = useCallback(async () => {
    if (!activeProject) return;
    const src = appMode === "plan"
      ? (generatedScript || planStateToScript(planState))
      : script;
    setProjectSaving(true);
    try {
      await apiSaveScriptToProject(src);
    } catch {
      // silently ignore — backend will be available when app is running
    } finally {
      setProjectSaving(false);
    }
  }, [activeProject, appMode, generatedScript, planState, script]);

  // ── Small collapse button style (Script mode) ─────────────────────────────
  useEffect(() => {
    if (appMode !== "plan") return;
    setScript(planStateToScript(planState));
  }, [appMode, planState, setScript]);

  const btnStyle: React.CSSProperties = {
    position: "absolute",
    zIndex: 10,
    width: 20,
    height: 20,
    border: "1px solid #ccc",
    borderRadius: 4,
    background: "#f0f0f0",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    color: "#555",
    padding: 0,
    lineHeight: 1,
    flexShrink: 0,
  };

  const plan3d = planGenResult ?? scriptPlan;
  const currentErrors = appMode === "plan" ? planErrors : appMode === "script" ? scriptErrors : [];

  // Active floor plan: use floor-partitioned plan if FLOOR commands were used
  const rawPlan = appMode === "plan" ? (planGenResult ?? scriptPlan) : scriptPlan;
  const floorEntries = rawPlan?.floors ?? [];
  const floorDisplayPlan = floorEntries.length > 1
    ? (floorEntries.find((f) => f.floor === activeFloor) ?? floorEntries[0])
    : null;

  // Compute a nominal scale label for the print title block
  const activePlan = appMode === "plan" ? (planGenResult ?? scriptPlan) : scriptPlan;
  const scaleLabel = (() => {
    const bbox = activePlan?.bounding_box;
    if (!bbox) return "NTS";
    const widthMm = bbox[2] - bbox[0];
    const a3PrintableMm = 380;
    const raw = widthMm / a3PrintableMm;
    const niceScales = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
    const nice = niceScales.find((s) => s >= raw) ?? 5000;
    return `1:${nice}`;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Toolbar
        onGenerate={appMode === "plan" ? handlePlanGenerate : handleScriptGenerate}
        onExportDxf={handleExportDxf}
        onExportPng={handleExportPng}
        loading={appMode === "plan" ? planLoading : scriptLoading}
        exportLoading={exportLoading}
        appMode={appMode}
        onModeChange={handleModeChange}
        planViewState={planViewState}
        onBackToEdit={handleBackToEdit}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        showDimensions={showDimensions}
        onToggleDimensions={() => setShowDimensions((v) => !v)}
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onPresent={() => setIsPresentationMode(true)}
        onSave={handleSave}
        onLoad={handleLoad}
        onLoadTemplate={setScript}
        onPrint={appMode !== "3d" ? handlePrint : undefined}
        onExportIfc={appMode !== "3d" ? handleExportIfc : undefined}
        activeProject={activeProject}
        onNewProject={() => setProjectDialogMode("new")}
        onOpenProject={() => setProjectDialogMode("open")}
        onSaveToProject={handleSaveToProject}
        projectSaving={projectSaving}
      />

      {projectDialogMode && (
        <ProjectDialog
          mode={projectDialogMode}
          onClose={() => setProjectDialogMode(null)}
          onProjectCreated={handleProjectCreated}
          onProjectOpened={handleProjectOpened}
        />
      )}

      {showPrint && printImageUrl && (
        <PrintLayoutModal
          imageDataUrl={printImageUrl}
          projectName={projectName}
          scaleLabel={scaleLabel}
          northAngle={activePlan?.lot?.north_angle}
          onClose={() => setShowPrint(false)}
        />
      )}

      {isPresentationMode && (
        <PresentationMode
          plan={plan3d}
          view={presentationView}
          onViewChange={setPresentationView}
          onExit={() => setIsPresentationMode(false)}
          projectName={projectName}
          view3dSettings={view3dSettings}
          onSettingsChange={handleUpdate3DSettings}
        />
      )}

      {/* Error banner */}
      {currentErrors.length > 0 && (
        <div
          style={{
            background: "#fde8e8",
            borderBottom: "1px solid #e57373",
            padding: "6px 16px",
            fontSize: 12,
            color: "#c0392b",
            flexShrink: 0,
          }}
        >
          {currentErrors.map((e, i) => (
            <div key={i}>
              {e.line > 0 ? `Line ${e.line}: ` : ""}
              {e.message}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {appMode === "script" ? (
          /* ── SCRIPT MODE ─────────────────────────────────────────────── */
          <>
            {/* Left: Script Editor */}
            <div
              style={{
                width: EDITOR_WIDTH[editorMode],
                minWidth: EDITOR_MIN_WIDTH[editorMode],
                borderRight: "1px solid #ddd",
                display: "flex",
                flexDirection: "column",
                transition: "width 0.2s ease, min-width 0.2s ease",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setEditorMode((m) => (m === "collapsed" ? "normal" : "collapsed"))
                }
                title={editorMode === "collapsed" ? "Expand editor" : "Collapse editor"}
                style={{ ...btnStyle, top: 6, right: 4 }}
              >
                {editorMode === "collapsed" ? "›" : "‹"}
              </button>

              {editorMode !== "collapsed" && (
                <button
                  type="button"
                  onClick={() =>
                    setEditorMode((m) => (m === "maximized" ? "normal" : "maximized"))
                  }
                  title={editorMode === "maximized" ? "Restore editor" : "Maximize editor"}
                  style={{ ...btnStyle, top: 6, right: 28 }}
                >
                  {editorMode === "maximized" ? "⊡" : "⊞"}
                </button>
              )}

              {editorMode !== "collapsed" && (
                <ScriptEditor value={script} onChange={setScript} errors={scriptErrors} />
              )}

              {editorMode === "collapsed" && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%) rotate(-90deg)",
                    whiteSpace: "nowrap",
                    fontSize: 10,
                    color: "#999",
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                >
                  Script
                </div>
              )}
            </div>

            {/* Center: Canvas */}
            <div ref={canvasContainerRef} style={{ flex: 1, overflow: "hidden" }}>
              <FloorPlanCanvas
                plan={floorDisplayPlan ?? scriptPlan}
                width={canvasSize.width}
                height={canvasSize.height}
                showDimensions={showDimensions}
                stageRef={floorPlanStageRef}
                floors={floorEntries.length > 1 ? floorEntries : undefined}
                activeFloor={activeFloor}
                onFloorChange={setActiveFloor}
              />
            </div>

            {/* Right: Properties Panel */}
            {editorMode !== "maximized" && (
              <div
                style={{
                  width: propsCollapsed ? 28 : "20%",
                  minWidth: propsCollapsed ? 28 : 220,
                  borderLeft: "1px solid #ddd",
                  background: "#fff",
                  overflowY: propsCollapsed ? "hidden" : "auto",
                  position: "relative",
                  transition: "width 0.2s ease, min-width 0.2s ease",
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  onClick={() => setPropsCollapsed((v) => !v)}
                  title={propsCollapsed ? "Expand properties" : "Collapse properties"}
                  style={{ ...btnStyle, top: 6, right: 4 }}
                >
                  {propsCollapsed ? "‹" : "›"}
                </button>

                {!propsCollapsed && <PropertiesPanel plan={scriptPlan} />}

                {propsCollapsed && (
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%) rotate(90deg)",
                      whiteSpace: "nowrap",
                      fontSize: 10,
                      color: "#999",
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  >
                    Properties
                  </div>
                )}
              </div>
            )}
          </>
        ) : appMode === "plan" ? (
          /* ── PLAN MODE ───────────────────────────────────────────────── */
          <>
            {/* Left: Tool palette */}
            <div
              style={{
                width: 260,
                minWidth: 260,
                borderRight: "1px solid #ddd",
                flexShrink: 0,
                opacity: planViewState === "generated" ? 0.45 : 1,
                pointerEvents: planViewState === "generated" ? "none" : "auto",
                overflow: "hidden",
              }}
            >
              <PlanModeLeft
                activeTool={activeTool}
                wallThickness={wallThickness}
                doorSwing={doorSwing}
                windowHeight={windowHeight}
                labelText={labelText}
                gridSnap={gridSnap}
                lotWidth={planState.lot?.width ?? 10000}
                lotHeight={planState.lot?.height ?? 15000}
                northAngle={planState.lot?.northAngle ?? 90}
                setbacks={planState.setbacks}
                lotCreated={planState.lot !== null}
                onSetLot={setLot}
                onSetSetbacks={setSetbacks}
                onSetWallThickness={setWallThickness}
                onSetDoorSwing={setDoorSwing}
                onSetWindowHeight={setWindowHeight}
                onSetLabelText={setLabelText}
                onSetGridSnap={setGridSnap}
                onActivateTool={handleActivateTool}
              />
            </div>

            {/* Center: edit canvas or generated/preview result */}
            <div ref={canvasContainerRef} style={{ flex: 1, overflow: "hidden" }}>
              {planViewState === "editing" ? (
                <PlanModeCanvas
                  planState={planState}
                  activeTool={activeTool}
                  gridSnap={gridSnap}
                  selectedElement={selectedElement}
                  defaultWallThickness={wallThickness}
                  defaultDoorSwing={doorSwing}
                  defaultWindowHeight={windowHeight}
                  defaultLabelText={labelText}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  onAddWall={addWall}
                  onAddWalls={addWalls}
                  onAddDoor={addDoor}
                  onAddWindow={addWindow}
                  onAddLabel={addLabel}
                  onSelectElement={setSelectedElement}
                  onDeleteElement={deleteElement}
                  onToolComplete={() => setActiveTool("select")}
                  onUndo={undo}
                  onRedo={redo}
                  showDimensions={showDimensions}
                />
              ) : (
                <FloorPlanCanvas
                  plan={floorDisplayPlan ?? (planGenResult ?? scriptPlan)}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  showDimensions={showDimensions}
                  stageRef={floorPlanStageRef}
                  floors={floorEntries.length > 1 ? floorEntries : undefined}
                  activeFloor={activeFloor}
                  onFloorChange={setActiveFloor}
                />
              )}
            </div>

            {/* Right: inspector or properties */}
            <div
              style={{
                width: "22%",
                minWidth: 240,
                borderLeft: "1px solid #ddd",
                background: "#fff",
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              {planViewState === "editing" ? (
                <PlanModeInspector
                  planState={planState}
                  selectedElement={selectedElement}
                  onUpdateWall={updateWall}
                  onUpdateDoor={updateDoor}
                  onUpdateWindow={updateWindow}
                  onUpdateLabel={updateLabel}
                  onDeleteElement={deleteElement}
                  onDeselect={() => setSelectedElement(null)}
                />
              ) : (
                <PropertiesPanel plan={planGenResult ?? scriptPlan} />
              )}
            </div>
          </>
        ) : (
          /* ── 3D MODE ─────────────────────────────────────────────────── */
          <div ref={canvasContainerRef} style={{ flex: 1, overflow: "hidden" }}>
            <ThreeDView
              plan={plan3d}
              width={canvasSize.width}
              height={canvasSize.height}
              settings={view3dSettings}
              onSettingsChange={handleUpdate3DSettings}
              captureRef={threeDCaptureRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}
