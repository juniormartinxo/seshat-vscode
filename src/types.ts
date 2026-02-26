export interface BaseSeshatEvent {
  event: string;
  [key: string]: unknown;
}

export interface SummaryEvent extends BaseSeshatEvent {
  event: 'summary';
  title?: string;
  data?: Record<string, string>;
}

export interface ProgressStartedEvent extends BaseSeshatEvent {
  event: 'progress_started';
  message: string;
}

export interface ProgressUpdateEvent extends BaseSeshatEvent {
  event: 'progress_update';
  message: string;
}

export interface ProgressDoneEvent extends BaseSeshatEvent {
  event: 'progress_done';
  message: string;
}

export interface StepEvent extends BaseSeshatEvent {
  event: 'step';
  message: string;
}

export interface InfoEvent extends BaseSeshatEvent {
  event: 'info';
  message: string;
}

export interface WarningEvent extends BaseSeshatEvent {
  event: 'warning';
  message: string;
}

export interface ErrorEvent extends BaseSeshatEvent {
  event: 'error';
  message: string;
}

export interface SuccessEvent extends BaseSeshatEvent {
  event: 'success';
  message: string;
}

export interface PanelEvent extends BaseSeshatEvent {
  event: 'panel';
  title: string;
  content: string;
}

export interface FileListEvent extends BaseSeshatEvent {
  event: 'file_list';
  title?: string;
  files: string[];
}

export interface ToolOutputEvent extends BaseSeshatEvent {
  event: 'tool_output';
  output: string;
  language?: string;
  status?: string | null;
}

export interface ReviewOutputEvent extends BaseSeshatEvent {
  event: 'review_output';
  text: string;
  files?: string[];
}

export interface MessageReadyEvent extends BaseSeshatEvent {
  event: 'message_ready';
  message: string;
}

export interface ConfirmNeededEvent extends BaseSeshatEvent {
  event: 'confirm_needed';
  message: string;
  default?: boolean;
}

export interface ChoiceNeededEvent extends BaseSeshatEvent {
  event: 'choice_needed';
  message: string;
  choices: string[];
  default?: string;
}

export interface CommittedEvent extends BaseSeshatEvent {
  event: 'committed';
  summary?: string;
  date?: string | null;
}

export interface CancelledEvent extends BaseSeshatEvent {
  event: 'cancelled';
  reason?: string;
}

export type SeshatEvent =
  | SummaryEvent
  | ProgressStartedEvent
  | ProgressUpdateEvent
  | ProgressDoneEvent
  | StepEvent
  | InfoEvent
  | WarningEvent
  | ErrorEvent
  | SuccessEvent
  | PanelEvent
  | FileListEvent
  | ToolOutputEvent
  | ReviewOutputEvent
  | MessageReadyEvent
  | ConfirmNeededEvent
  | ChoiceNeededEvent
  | CommittedEvent
  | CancelledEvent
  | BaseSeshatEvent;

export type SeshatRunnerStatus = 'idle' | 'running' | 'success' | 'error';
