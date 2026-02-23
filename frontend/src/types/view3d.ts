export interface View3DSettings {
  wallHeightMm: number;
  doorHeightMm: number;
  doorThicknessMm: number;
  windowSillMm: number;
  windowFrameDepthMm: number;
  glassOpacity: number;
  roofStyle: "none" | "flat" | "gable" | "hip" | "shed";
  roofPitchDeg: number;
  roofOverhangMm: number;
  roofColor: string;
  wallColor: string;
  skyStyle: "day" | "dusk" | "overcast";
  floorTexture: "none" | "tile" | "wood" | "concrete";
  showCeiling: boolean;
  showFurniture: boolean;
}

export const DEFAULT_VIEW3D_SETTINGS: View3DSettings = {
  wallHeightMm: 2700,
  doorHeightMm: 2100,
  doorThicknessMm: 40,
  windowSillMm: 900,
  windowFrameDepthMm: 70,
  glassOpacity: 0.45,
  roofStyle: "gable",
  roofPitchDeg: 30,
  roofOverhangMm: 600,
  roofColor: "#b04030",
  wallColor: "#c8b89a",
  skyStyle: "day",
  floorTexture: "tile",
  showCeiling: false,
  showFurniture: true,
};

