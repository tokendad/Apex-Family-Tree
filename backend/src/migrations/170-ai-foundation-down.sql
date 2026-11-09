DROP TABLE IF EXISTS ai_jobs;

DELETE FROM feature_flags WHERE key IN ('ai_transcription', 'ai_intake');

DELETE FROM app_settings WHERE key IN ('llm_provider', 'llm_model', 'llm_api_key');
