export interface DocBuildResult {
  file: string;
  hazard: string;
  buffer: Buffer;
  mustSurvive: Record<string, number>;
}

export interface ManifestEntry {
  file: string;
  hazard: string;
  mustSurvive: Record<string, number>;
}
