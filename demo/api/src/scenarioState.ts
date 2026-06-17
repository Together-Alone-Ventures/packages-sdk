import {
  DEFAULT_SCENARIO_ID,
  type ScenarioId,
  isScenarioId,
} from '../../shared/demoScenarios.js';
import { getScenarioSeed, type ScenarioSeed } from '../../shared/scenarioSeed.js';

let currentScenarioId: ScenarioId = DEFAULT_SCENARIO_ID;

export function getCurrentScenarioId(): ScenarioId {
  return currentScenarioId;
}

export function setCurrentScenarioId(id: ScenarioId): void {
  currentScenarioId = id;
}

export function parseScenarioId(value: unknown): ScenarioId | null {
  const raw = String(value ?? '').trim();
  return isScenarioId(raw) ? raw : null;
}

export function getCurrentSeed(): ScenarioSeed {
  return getScenarioSeed(currentScenarioId);
}
