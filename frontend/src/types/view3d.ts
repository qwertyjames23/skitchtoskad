export interface View3DSettings {
  wallHeightMm: number;
  doorHeightMm: number;
  doorThicknessMm: number;
  windowSillMm: number;
  windowFrameDepthMm: number;
  glassOpacity: number;
}

export const DEFAULT_VIEW3D_SETTINGS: View3DSettings = {
  wallHeightMm: 2700,
  doorHeightMm: 2100,
  doorThicknessMm: 40,
  windowSillMm: 900,
  windowFrameDepthMm: 70,
  glassOpacity: 0.45,
};

