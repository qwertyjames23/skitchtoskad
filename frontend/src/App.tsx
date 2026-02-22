import { useState, useEffect, useRef, useCallback } from "react";
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
import { PresentationMode } from "./components/Presentation/PresentationMode";
import { saveScriptFile, loadScriptFile } from "./api/client";
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Toolbar
        onGenerate={appMode === "plan" ? handlePlanGenerate : handleScriptGenerate}
        onExportDxf={appMode === "plan" ? planExportDxf : scriptExportDxf}
        loading={appMode === "plan" ? planLoading : scriptLoading}
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
      />

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
                plan={scriptPlan}
                width={canvasSize.width}
                height={canvasSize.height}
                showDimensions={showDimensions}
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
                  plan={planGenResult ?? scriptPlan}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  showDimensions={showDimensions}
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
            />
          </div>
        )}
      </div>
    </div>
  );
}
