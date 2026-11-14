-- Pin the trigger helper's search_path and schema-qualify the clock function.
-- The helper runs only as a table trigger and does not need caller-controlled resolution.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;
