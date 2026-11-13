import type { VirtualProjectFile } from './types';

const HANDOFF_STORAGE_KEY = 'chronoforge_active_handoff_v1';

export interface WorkspaceHandoffPayload {
  presetId: string;
  entryFile: string;
  files: VirtualProjectFile[];
  updatedAt: string;
}

export function saveCrossZoneHandoff(input: {
  presetId: string;
  entryFile: string;
  files: VirtualProjectFile[];
}): void {
  if (typeof window === 'undefined' || !input.files.length) return;
  try {
    const payload: WorkspaceHandoffPayload = {
      presetId: input.presetId,
      entryFile: input.entryFile,
      files: input.files.map((f) => ({
        path: f.path,
        kind: f.kind,
        code: f.code,
        summary: f.summary,
      })),
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage quota or privacy mode errors
  }
}

export function loadCrossZoneHandoff(): WorkspaceHandoffPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(HANDOFF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkspaceHandoffPayload>;
    if (
      typeof parsed.entryFile === 'string' &&
      Array.isArray(parsed.files) &&
      parsed.files.length > 0
    ) {
      return {
        presetId: typeof parsed.presetId === 'string' ? parsed.presetId : 'custom-workspace',
        entryFile: parsed.entryFile,
        files: parsed.files,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      };
    }
  } catch {
    // ignore malformed localStorage state
  }
  return null;
}
