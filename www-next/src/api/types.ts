// StarNav API response types

export interface VfrHud {
  airspeed: number | null;
  groundspeed: number | null;
  heading: number | null;
  throttle: number | null;
  alt: number | null;
  climb: number | null;
}

export interface Battery {
  voltage: number | null;
  current: number | null;
  remaining: number | null;
}

export interface Nav {
  wp_num: number | null;
  wp_dist: number | null;
  xtrack_error: number | null;
  nav_bearing: number | null;
  target_bearing: number | null;
}

export interface Vibration {
  x: number | null;
  y: number | null;
  z: number | null;
}

export interface PositionData {
  timestamp: string;
  startup_phase?: string | null;
  startup_detail?: string;
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
  // HUD telemetry (v1.1)
  vfr_hud?: VfrHud;
  battery?: Battery;
  nav?: Nav;
  vibration?: Vibration;
  flight_mode?: string | null;
  gps_sats?: number | null;
  gps_hdop?: number | null;
  ekf_aiding?: string | null;
  ekf_detail?: {
    flags: number;
    vel_var: number | null;
    pos_horiz_var: number | null;
    pos_vert_var: number | null;
    compass_var: number | null;
    terrain_var: number | null;
  };
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
    min_stable_time: number;
    accuracy_jump_threshold: number;
    staleness_timeout: number;
  };
  rates: {
    send_rate_active: number;
    send_rate_passive: number;
    send_rate_degraded: number;
  };
  logging: {
    csv_enabled: boolean;
    max_log_size_mb: number;
  };
  hud: {
    update_rate_hz: number;
    altitude_source?: string;
    altitude_unit?: string;
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
  branch?: string;
  last_checked?: number;
}
