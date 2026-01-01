/**
 * Core TypeScript type definitions for Escalada Competition System
 *
 * Shared across ControlPanel, JudgePage, and ContestPage components
 */

/**
 * Competitor in a climbing competition
 */
export interface Competitor {
  /** Competitor's full name */
  nume: string;
  /** Final score (holds completed) */
  score: number;
  /** Registered completion time in seconds (null if not completed) */
  time: number | null;
  /** Whether competitor has completed their climb */
  marked: boolean;
  /** Competitor's club/team affiliation (optional) */
  club?: string;
}

/**
 * Competition box configuration
 * Represents a single climbing route/problem with its competitors
 */
export interface Box {
  /** Box index (0-based) */
  idx: number;
  /** Box/category display name */
  name: string;
  /** Current route number (1-based) */
  routeIndex: number;
  /** Total number of routes in competition */
  routesCount: number;
  /** Number of holds on current route */
  holdsCount: number;
  /** Array of hold counts for all routes (indexed by routeIndex-1) */
  holdsCounts: number[];
  /** Timer preset in MM:SS format */
  timerPreset: string;
  /** Competition category name */
  categorie: string;
  /** List of competitors in this box */
  concurenti: Competitor[];
}

/**
 * Timer state for a box
 */
export type TimerState = 'idle' | 'running' | 'paused';

/**
 * WebSocket connection status
 */
export type WsStatus = 'closed' | 'open' | 'connecting' | 'error';

/**
 * Command type for backend API
 */
export type CommandType =
  | 'INIT_ROUTE'
  | 'START_TIMER'
  | 'STOP_TIMER'
  | 'RESUME_TIMER'
  | 'PROGRESS_UPDATE'
  | 'REGISTER_TIME'
  | 'SUBMIT_SCORE'
  | 'REQUEST_STATE'
  | 'RESET_BOX'
  | 'REQUEST_ACTIVE_COMPETITOR'
  | 'SET_TIME_CRITERION'
  | 'TIMER_SYNC';

/**
 * State snapshot from backend
 */
export interface StateSnapshot {
  type: 'STATE_SNAPSHOT';
  boxId: number;
  initiated: boolean;
  holdsCount: number;
  routeIndex: number;
  currentClimber: string;
  started: boolean;
  timerState: TimerState;
  holdCount: number;
  competitors: Array<{ nume: string; marked: boolean }>;
  categorie: string;
  registeredTime?: number | null;
  remaining?: number | null;
  timeCriterionEnabled?: boolean;
  timerPreset?: string | null;
  timerPresetSec?: number | null;
  sessionId?: string;
}

/**
 * WebSocket message from backend
 */
export type WebSocketMessage =
  | StateSnapshot
  | {
      type: 'PING' | 'PONG';
      timestamp?: number;
    }
  | {
      type: 'TIME_CRITERION';
      timeCriterionEnabled: boolean;
    }
  | {
      type: CommandType;
      boxId: number;
      [key: string]: any;
    };

/**
 * API command payload
 */
export interface ApiCommand {
  boxId: number;
  type: CommandType;
  sessionId?: string;
  boxVersion?: number;
  // INIT_ROUTE fields
  routeIndex?: number;
  holdsCount?: number;
  competitors?: Competitor[];
  categorie?: string;
  timerPreset?: string;
  // PROGRESS_UPDATE fields
  delta?: number;
  // SUBMIT_SCORE fields
  score?: number;
  competitor?: string;
  registeredTime?: number;
  competitorIdx?: number;
  // TIMER_SYNC fields
  remaining?: number;
  // SET_TIME_CRITERION fields
  timeCriterionEnabled?: boolean;
}

/**
 * API response
 */
export interface ApiResponse {
  status: 'ok' | 'error' | 'ignored';
  reason?: string;
  detail?: string;
}

/**
 * Ranking row for ceremony/display
 */
export interface RankingRow {
  rank: number;
  nume: string;
  club?: string;
  score: number;
  time: number | null;
  timeFormatted?: string;
}

/**
 * Loading state for async operations
 */
export type LoadingBoxes = Set<number>;

/**
 * Error message from WebSocket/API
 */
export interface ErrorMessage {
  message: string;
  code?: number;
  timestamp?: number;
}

/**
 * Props for error boundary
 */
export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Error boundary state
 */
export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}
