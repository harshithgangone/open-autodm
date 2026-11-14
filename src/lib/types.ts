/**
 * Shared domain types - DB rows, job payloads, Meta webhook shapes.
 */

// ── Automations ─────────────────────────────────────────────────────────────

export type AutomationType = 'comment_dm' | 'dm_reply' | 'story_reply' | 'reel_dm';
export type DMResponseType = 'text' | 'card' | 'ask_follow' | 'lead_form';

export interface CardButton {
  id: string;
  title: string;
  link: string;
}

export interface DMResponse {
  id: string;
  type: DMResponseType;
  content: string;
  buttonTitle?: string;
  buttonLink?: string;
  buttons?: CardButton[];
  cardImage?: string;
  cardTitle?: string;
  cardSubtitle?: string;
  cardButtons?: CardButton[];
}

// ── Canonical Flow Graph ────────────────────────────────────────────────────

export type FlowNodeType =
  | 'trigger'
  | 'send_dm'
  | 'delay'
  | 'condition'
  | 'action'
  | 'follow_up'
  | 'end';

export interface FlowNodePosition {
  x: number;
  y: number;
}

export interface FlowNodeData {
  label?: string;
  triggerType?: 'comment_dm' | 'dm_reply' | 'story_reply' | 'reel_dm';
  postId?: string | null;
  postThumbnailUrl?: string | null;
  postCaption?: string | null;
  keywords?: string[] | null;
  keywordsAnyMode?: boolean;
  reelId?: string | null;
  reelMatchAny?: boolean;
  messageText?: string;
  messageVariations?: string[];
  buttonTitle?: string;
  buttonLink?: string;
  buttons?: CardButton[];
  delayMinutes?: number;
  conditionType?: 'is_following' | 'has_interacted' | 'keyword_match';
  conditionValue?: string;
  actionType?: 'public_reply' | 'tag_contact' | 'log_analytics';
  actionPayload?: Record<string, unknown>;
  followUpText?: string;
  publicReplyEnabled?: boolean;
  publicReplyOptions?: string[];
  publicReplyMode?: 'manual' | 'ai_generated';
  aiRuntimeModeEnabled?: boolean;
  aiRuntimeInstructions?: string;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position: FlowNodePosition;
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: 'default' | 'yes' | 'no' | string;
  targetHandle?: 'default' | string;
  label?: string;
}

export interface FlowGraph {
  version: 1;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface AutomationRow {
  id: string;
  user_id: string;
  instagram_account_id: string;
  name: string;
  type: AutomationType;
  is_active: boolean;
  post_id: string | null;
  post_thumbnail_url: string | null;
  post_caption: string | null;
  keywords: string[] | null;
  comment_reply_options: string[];
  public_reply_enabled?: boolean;
  public_reply_mode?: 'manual' | 'ai_generated';
  public_reply_options?: string[];
  public_reply_ai_instructions?: string | null;
  dm_opening_message_enabled: boolean;
  dm_opening_message: string;
  dm_opening_message_variations?: string[];
  dm_opening_message_button_title: string | null;
  dm_opening_message_button_link: string | null;
  ask_to_follow_enabled: boolean;
  ask_to_follow_message: string;
  ask_to_follow_visit_profile_button: string;
  ask_to_follow_confirm_button: string;
  dm_responses: DMResponse[];
  follow_up_enabled?: boolean;
  follow_up_delay_minutes?: number;
  follow_up_message?: string;
  follow_up_ai_instructions?: string | null;
  ai_runtime_mode_enabled?: boolean;
  ai_runtime_instructions?: string | null;
  ai_model?: string;
  total_dms_sent: number;
  is_traffic_guard_paused?: boolean;
  traffic_guard_paused_at?: string | null;
  traffic_guard_incident_id?: string | null;
  created_at: string;
  updated_at: string;
  flow_graph?: FlowGraph | null;
}

export interface InstagramAccountRow {
  id: string;
  user_id: string;
  instagram_user_id: string;
  username: string | null;
  name: string | null;
  profile_picture_url: string | null;
  access_token_encrypted: string;
  token_expires_at: string | null;
  is_active: boolean;
  paused_until: string | null;
  pause_reason: string | null;
  traffic_guard_status?: 'normal' | 'high_traffic' | 'recovered';
  traffic_guard_paused?: boolean;
  traffic_guard_incident_id?: string | null;
  traffic_guard_settings?: TrafficGuardSettings;
  created_at: string;
  updated_at: string;
}

export interface TrafficGuardSettings {
  high_traffic_threshold: number;
  recovery_threshold: number;
  recovery_duration_seconds: number;
  window_seconds: number;
}

export interface TrafficIncidentRow {
  id: string;
  instagram_account_id: string;
  user_id: string;
  status: 'high_traffic' | 'recovered' | 'dismissed';
  peak_comments_per_minute: number;
  threshold_high: number;
  threshold_recovery: number;
  recovery_duration_seconds: number;
  opened_at: string;
  last_spike_at: string;
  recovered_at: string | null;
  paused_at: string | null;
  paused_automation_ids: string[];
  resumed_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrafficNotificationRow {
  id: string;
  user_id: string;
  instagram_account_id: string;
  incident_id: string;
  type: 'high_traffic' | 'recovered';
  title: string;
  message: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface TrafficGuardStatusResponse {
  account_id: string;
  traffic_status: 'normal' | 'high_traffic' | 'recovered';
  is_paused: boolean;
  paused_incident_id: string | null;
  current_60s_count: number;
  settings: TrafficGuardSettings;
  active_automations_count: number;
  paused_by_guard_count: number;
  held_jobs_count: number;
  incident: {
    id: string;
    status: 'high_traffic' | 'recovered' | 'dismissed';
    peak_rate: number;
    opened_at: string;
    last_spike_at: string;
    recovered_at: string | null;
    paused_at: string | null;
    paused_automation_ids: string[];
    resumed_at: string | null;
  } | null;
  notifications?: TrafficNotificationRow[];
}

// ── Job queue ───────────────────────────────────────────────────────────────

export interface AutoDmJobPayload {
  automationId: string;
  instagramAccountId: string; // internal DB UUID
  igAccountIgsid: string; // Meta IGSID of the creator's account
  triggerType: 'comment' | 'dm' | 'story_reply' | 'dm_reply_followup' | 'reel_dm';
  triggerUserId: string; // IGSID of the commenter / DM sender
  triggerUsername?: string | null; // for {username} personalization (comments carry it; DMs don't)
  triggerEventId: string; // comment ID or message mid
  triggerTimestamp: number; // unix epoch ms
  postId: string | null;
  commentText: string | null;
  messageText: string | null;
  // Instagram Live comment indicator
  isLive?: boolean;
  mediaProductType?: string;
  // 2-step flow (opening DM → quick-reply tap → follow-up)
  isFollowUp?: boolean;
  sessionId?: string;
  sessionStep?: number;
  selectedVariationIndex?: number;
  selectedPublicReplyIndex?: number;
  isScheduledFollowUp?: boolean;
  followUpText?: string;
  flowNodeId?: string | null;
  sharedReelId?: string | null;
  sharedReelUrl?: string | null;
  sharedReelTitle?: string | null;
}

export interface AutomationFollowUpRow {
  id: string;
  automation_id: string;
  instagram_account_id: string;
  session_id: string | null;
  recipient_id: string;
  recipient_username: string | null;
  qualified_event_id: string;
  qualified_timestamp: string;
  scheduled_for: string;
  status: 'waiting_response' | 'scheduled' | 'sending' | 'sent' | 'skipped' | 'expired' | 'held' | 'failed';
  message_snapshot: string;
  error_reason: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobQueueRow {
  id: string;
  job_type: 'auto_dm' | 'follow_up';
  payload: AutoDmJobPayload;
  dedupe_key: string;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'held';
  run_after: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Meta webhook payloads ───────────────────────────────────────────────────

export interface MetaWebhookBody {
  object: 'instagram' | 'page';
  entry: MetaWebhookEntry[];
}

export interface MetaWebhookEntry {
  id: string; // IGSID of the business account
  time: number; // unix seconds
  changes?: MetaWebhookChange[];
  messaging?: MetaWebhookMessaging[];
}

export interface MetaWebhookChange {
  field: 'comments' | 'mentions' | 'story_insights' | string;
  value: MetaCommentChangeValue;
}

export interface MetaCommentChangeValue {
  from: { id: string; username?: string };
  media: { id: string; media_product_type?: string };
  id: string; // comment ID
  text: string;
  timestamp?: number; // unix seconds - Meta may omit on IG comment webhooks
  parent_id?: string;
}

export interface MetaMessageAttachment {
  type: 'ig_reel' | 'reel' | 'share' | 'ig_post' | 'image' | 'video' | 'audio' | 'file' | 'story_mention' | string;
  payload?: {
    id?: string;
    url?: string;
    title?: string;
  };
}

export interface MetaWebhookMessaging {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number; // unix ms
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    quick_reply?: { payload: string };
    /** Present when the message is a reply to one of the account's stories. */
    reply_to?: { story?: { id?: string; url?: string }; mid?: string };
    attachments?: MetaMessageAttachment[];
  };
  read?: { watermark: number };
  delivery?: { watermark: number; seq?: number };
  postback?: { payload: string; title: string };
}

// ── Instagram OAuth responses ───────────────────────────────────────────────

export interface IgShortLivedTokenResponse {
  access_token: string;
  user_id: string;
  permissions?: string[];
}

export interface IgLongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds (~60 days)
}

export interface IgUserProfile {
  user_id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
}
