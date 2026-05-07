-- Rename the display name of the feature flow's `review` status to "Staging".
-- Slug stays `review` to avoid touching permissions, transitions, skills, and URLs.
UPDATE flow_statuses fs
SET name = 'Staging',
    description = 'Feature is staged for release'
FROM flows f
WHERE fs.flow_id = f.id
  AND f.slug = 'feature'
  AND fs.slug = 'review';
