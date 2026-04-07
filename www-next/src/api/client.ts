// StarNav API client — fetch wrappers for all CGI endpoints

import type {
  StatusResponse,
  CommandResponse,
  ConfigData,
  FlightLog,
  FlightLogTail,
  VersionInfo,
} from "./types";

const BASE = "/cgi-bin";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(`POST ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchStatus(): Promise<StatusResponse> {
  return get<StatusResponse>("/status.cgi");
}

export function executeCommand(
  action: "start" | "stop" | "restart",
): Promise<CommandResponse> {
  return post<CommandResponse>("/api.cgi", { action });
}

export function readConfig(): Promise<ConfigData> {
  return get<ConfigData>("/config.cgi?action=read");
}

export function writeConfig(
  data: Partial<ConfigData>,
): Promise<{ success: boolean; error?: string }> {
  return post("/config.cgi", data);
}

export function fetchFlightLogs(): Promise<FlightLog[]> {
  return get<FlightLog[]>("/logs-csv.cgi?action=list");
}

export function tailFlightLog(
  file: string,
  lines = 50,
): Promise<FlightLogTail> {
  return get<FlightLogTail>(
    `/logs-csv.cgi?action=tail&file=${encodeURIComponent(file)}&lines=${lines}`,
  );
}

export function downloadFlightLogUrl(file: string): string {
  return `${BASE}/logs-csv.cgi?action=download&file=${encodeURIComponent(file)}`;
}

export function fetchVersion(): Promise<VersionInfo> {
  return get<VersionInfo>("/version.cgi");
}

// ── Update Management (re-exported from shared library) ──────────────
export { updateDevices, checkUpdate, listBranches } from '@update/api';
export type { CheckUpdateResponse, BranchList } from '@update/types';
