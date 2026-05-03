-- Add nullable visual customization fields:
--   projects.color  – hex color for the project chip
--   flows.icon      – icon name from the curated set for the flow
--   flow_statuses.color – hex color for the stage pill
ALTER TABLE "projects" ADD COLUMN "color" TEXT;
ALTER TABLE "flows" ADD COLUMN "icon" TEXT;
ALTER TABLE "flow_statuses" ADD COLUMN "color" TEXT;
