UPDATE "agentVersion"
SET manifest = (manifest - 'trigger') || jsonb_build_object(
  'triggers',
  jsonb_build_array(manifest -> 'trigger')
)
WHERE manifest ? 'trigger';

UPDATE "agentBuilderArtifact" AS artifact
SET content = jsonb_pretty(version.manifest) || E'\n'
FROM "agentVersion" AS version
WHERE artifact."versionId" = version.id
  AND artifact.path = 'agent/manifest.json'
  AND artifact.status = 'READY';
