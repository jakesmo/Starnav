// Zod schemas for config validation

import { z } from "zod";

const positiveFloat = z.coerce.number().positive();
const positiveInt = z.coerce.number().int().positive();
const mavlinkId = z.coerce.number().int().min(1).max(255);

export const starlinkSection = z.object({
  dish_address: z.string().min(1, "Dish address is required"),
  gps_mode: z.enum(["disable", "enable", "auto"]),
});

export const mavlinkSection = z.object({
  connection: z.string().min(1, "Connection string is required"),
  target_system: mavlinkId,
  target_component: mavlinkId,
  source_system: mavlinkId,
  source_component: mavlinkId,
});

export const thresholdsSection = z.object({
  uncertainty_limit: positiveFloat,
  min_stable_time: positiveFloat,
  accuracy_jump_threshold: positiveFloat,
  staleness_timeout: positiveFloat,
});

export const ratesSection = z.object({
  send_rate_active: positiveFloat,
  send_rate_passive: positiveFloat,
  send_rate_degraded: positiveFloat,
});

export const loggingSection = z.object({
  csv_enabled: z.coerce.boolean(),
  max_log_size_mb: positiveInt,
});

export const hudSection = z.object({
  update_rate_hz: z.coerce.number().min(1).max(10),
});

export const configSchema = z.object({
  starlink: starlinkSection,
  mavlink: mavlinkSection,
  thresholds: thresholdsSection,
  rates: ratesSection,
  logging: loggingSection,
  hud: hudSection.optional(),
});

export type ValidatedConfig = z.infer<typeof configSchema>;
