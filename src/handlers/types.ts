/**
 * @file Shared REST handler types for OpenAPI-backed adapters.
 *
 * This module centralizes handler type aliases derived from Simulacrum's
 * `SimulationHandlers` map. Extracted handler modules import these aliases so
 * adapter signatures stay aligned with the Foundation simulator without
 * duplicating indexed access types.
 */
import type {SimulationHandlers} from '@simulacrum/foundation-simulator';

export type SimulationHandler = SimulationHandlers[string];
