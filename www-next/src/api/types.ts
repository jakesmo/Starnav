// StarNav API response types

export interface PositionData {
  timestamp: string;
  startup_phase: string;
  startup_detail: string;
  dish_address: string;
  mavlink_connection: string;
  uncertainty_limit: number;
  starlink: {
    lat: number | null;
    lon: number | null;
    alt: number | null;
    uncertainty_1sigma: number | null;
    uncertainty_99: number | null;
  };
  gps: {
    lat: number | null;
    lon: number | null;
    alt: number | null;
  };
  ekf: {
    lat: number | null;
    lon: number | null;
    alt: number | null;
    const_pos_mode: boolean;
    pos_variance: number | null;
  };
  attitude: {
    roll: number | null;
    pitch: number | null;
    yaw: number | null;
  };
  accuracy_3d: number | null;
  sending: boolean;
  send_interval: number | null;
  last_send_epoch: number | null;
  correction: string | null;
  last_ack_result: string | null;
  is_armed: boolean;
  in_air: boolean;
  quality_ok: boolean;
  position_stale: boolean;
  position_age: number | null;
  ekf_source: string | null;
  ack_accept_rate: number | null;
}

export interface StatusResponse {
  process_running: boolean;
  pid: number | null;
  data_age_seconds: number;
  position: PositionData;
}

export interface CommandResponse {
  success: boolean;
  command: string;
  output: string;
  exit_code: number;
}

export interface ConfigData {
  starlink: {
    dish_address: string;
    gps_mode: string;
  };
  mavlink: {
    connection: string;
    target_system: number;
    target_component: number;
    source_system: number;
    source_component: number;
  };
  thresholds: {
    uncertainty_limit: number;
    stale_timeout: number;
  };
  rates: {
    send_interval: number;
    poll_interval: number;
  };
  logging: {
    csv_enabled: boolean;
    max_log_size_mb: number;
  };
}

export interface FlightLog {
  name: string;
  size_kb: number;
  lines: number;
  modified: string;
}

export interface FlightLogTail {
  header: string;
  rows: string[];
}

export interface LogEntry {
  timestamp: string;
  level: string;
  source: string;
  message: string;
}

export interface VersionInfo {
  commit: string;
  update_available: boolean;
  remote_commit?: string;
}
