-- Drop tables in reverse order
DROP TABLE IF EXISTS outline_items;
DROP TABLE IF EXISTS lanes;
DROP TABLE IF EXISTS beat_connections;
DROP TABLE IF EXISTS beats;
DROP TABLE IF EXISTS script_elements;
DROP TABLE IF EXISTS scenes;
DROP TABLE IF EXISTS outline_units;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS characters;
DROP TABLE IF EXISTS projects;

-- Drop extension
DROP EXTENSION IF EXISTS "uuid-ossp";
