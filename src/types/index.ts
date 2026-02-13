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
  /** Box index (0-based) (optional; many screens use array index) */
  idx?: number;
  /** Box/category display name (optional; commonly derived from `categorie`) */
  name?: string;
  /** Whether the current route has been initiated */
  initiated?: boolean;
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
  | 'SET_TIMER_PRESET'
  | 'START_TIMER'
  | 'STOP_TIMER'
  | 'RESUME_TIMER'
  | 'PROGRESS_UPDATE'
  | 'REGISTER_TIME'
  | 'SUBMIT_SCORE'
  | 'REQUEST_STATE'
  | 'RESET_BOX'
  | 'RESET_PARTIAL'
  | 'REQUEST_ACTIVE_COMPETITOR'
  | 'ACTIVE_CLIMBER'
  | 'SET_TIME_CRITERION'
  | 'SET_TIME_TIEBREAK_DECISION'
  | 'SET_PREV_ROUNDS_TIEBREAK_DECISION'
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
  routesCount?: number;
  holdsCounts?: number[];
  currentClimber: string;
  preparingClimber?: string;
  started: boolean;
  timerState: TimerState;
  holdCount: number;
  competitors: Array<{ nume: string; marked: boolean }>;
  categorie: string;
  boxVersion?: number;
  registeredTime?: number | null;
  remaining?: number | null;
  timeCriterionEnabled?: boolean;
  timeTiebreakPreference?: 'yes' | 'no' | null;
  timeTiebreakDecisions?: Record<string, 'yes' | 'no'>;
  timeTiebreakResolvedFingerprint?: string | null;
  timeTiebreakResolvedDecision?: 'yes' | 'no' | null;
  prevRoundsTiebreakPreference?: 'yes' | 'no' | null;
  prevRoundsTiebreakDecisions?: Record<string, 'yes' | 'no'>;
  prevRoundsTiebreakOrders?: Record<string, string[]>;
  prevRoundsTiebreakRanks?: Record<string, Record<string, number>>;
  prevRoundsTiebreakLineageRanks?: Record<string, Record<string, number>>;
  prevRoundsTiebreakResolvedFingerprint?: string | null;
  prevRoundsTiebreakResolvedDecision?: 'yes' | 'no' | null;
  timeTiebreakCurrentFingerprint?: string | null;
  timeTiebreakHasEligibleTie?: boolean;
  timeTiebreakIsResolved?: boolean;
  leadRankingRows?: Array<{
    name: string;
    rank: number;
    score?: number;
    total?: number;
    time?: number | null;
    tb_time?: boolean;
    tb_prev?: boolean;
    raw_scores?: Array<number | null | undefined>;
    raw_times?: Array<number | null | undefined>;
  }>;
  leadTieEvents?: Array<Record<string, any>>;
  leadRankingResolved?: boolean;
  leadRankingErrors?: string[];
  timeTiebreakEligibleGroups?: TimeTiebreakEligibleGroup[];
  scoresByName?: Record<string, Array<number | null | undefined>>;
  timesByName?: Record<string, Array<number | null | undefined>>;
  timerPreset?: string | null;
  timerPresetSec?: number | null;
  judgeChief?: string;
  competitionDirector?: string;
  chiefRoutesetter?: string;
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
  // RESET_PARTIAL fields
  resetTimer?: boolean;
  clearProgress?: boolean;
  unmarkAll?: boolean;
  // INIT_ROUTE fields
  routeIndex?: number;
  holdsCount?: number;
  routesCount?: number;
  holdsCounts?: number[];
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
  // SET_TIME_TIEBREAK_DECISION fields
  timeTiebreakDecision?: 'yes' | 'no';
  timeTiebreakFingerprint?: string;
  // SET_PREV_ROUNDS_TIEBREAK_DECISION fields
  prevRoundsTiebreakDecision?: 'yes' | 'no';
  prevRoundsTiebreakFingerprint?: string;
  prevRoundsTiebreakLineageKey?: string;
  prevRoundsTiebreakOrder?: string[];
  prevRoundsTiebreakRanksByName?: Record<string, number>;
}

/**
 * API response
 */
export interface ApiResponse {
  status: 'ok' | 'error' | 'ignored';
  reason?: string;
  detail?: string;
}

export interface TimeTiebreakEligibleGroupMember {
  name: string;
  value: number | null;
  time: number | null;
}

export interface TimeTiebreakEligibleGroup {
  context: 'overall' | 'route';
  rank: number;
  value: number | null;
  members: TimeTiebreakEligibleGroupMember[];
  fingerprint: string;
  stage?: 'previous_rounds' | 'time';
  affectsPodium?: boolean;
  status?: 'pending' | 'resolved' | 'error';
  detail?: string | null;
  prevRoundsDecision?: 'yes' | 'no' | null;
  prevRoundsOrder?: string[] | null;
  prevRoundsRanksByName?: Record<string, number> | null;
  lineageKey?: string | null;
  knownPrevRanksByName?: Record<string, number> | null;
  missingPrevRoundsMembers?: string[];
  requiresPrevRoundsInput?: boolean;
  timeDecision?: 'yes' | 'no' | null;
  resolvedDecision?: 'yes' | 'no' | null;
  resolutionKind?: 'previous_rounds' | 'time' | null;
  isResolved?: boolean;
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
