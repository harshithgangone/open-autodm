-- Migration: 20260731000009_flow_graph_and_reel_trigger.sql
-- Description: Adds canonical flow_graph support and reel_dm trigger type

-- 1. Forward-only enum extension for incoming shared-Reel DM trigger
ALTER TYPE public.automation_type ADD VALUE IF NOT EXISTS 'reel_dm';

-- 2. Add canonical flow_graph JSONB column to automations table
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS flow_graph JSONB DEFAULT NULL;

-- 3. Add trigger_config JSONB column for advanced trigger parameters
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS trigger_config JSONB DEFAULT '{}'::JSONB;

COMMENT ON COLUMN public.automations.flow_graph IS 'Canonical visual flow builder graph (nodes, edges, positions, version)';
COMMENT ON COLUMN public.automations.trigger_config IS 'Extended trigger parameters (e.g. shared-Reel matching options, story mention criteria)';
