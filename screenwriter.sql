--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5 (Debian 17.5-1.pgdg120+1)
-- Dumped by pg_dump version 17.5 (Debian 17.5-1.pgdg120+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: element_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.element_type AS ENUM (
    'ACTION',
    'CHARACTER',
    'DIALOG',
    'PARENTHETICAL',
    'SHOT',
    'TRANSITION'
);


ALTER TYPE public.element_type OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: acts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.acts (
    act_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    act_number integer NOT NULL,
    title character varying(255)
);


ALTER TABLE public.acts OWNER TO postgres;

--
-- Name: beat_connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.beat_connections (
    connection_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    from_beat_id uuid NOT NULL,
    to_beat_id uuid NOT NULL,
    from_side character varying(10) NOT NULL,
    to_side character varying(10) NOT NULL
);


ALTER TABLE public.beat_connections OWNER TO postgres;

--
-- Name: beats; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.beats (
    beat_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    scene_numbers character varying(100) NOT NULL,
    color character varying(20) NOT NULL,
    position_x integer NOT NULL,
    position_y integer NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    act_number integer NOT NULL,
    beat_order integer NOT NULL
);


ALTER TABLE public.beats OWNER TO postgres;

--
-- Name: characters; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.characters (
    character_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    character_name character varying(255) NOT NULL,
    description text
);


ALTER TABLE public.characters OWNER TO postgres;

--
-- Name: comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comments (
    comment_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    element_id uuid,
    user_id uuid NOT NULL,
    content text NOT NULL,
    is_resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scene_id uuid,
    CONSTRAINT check_comment_parent CHECK ((((element_id IS NOT NULL) AND (scene_id IS NULL)) OR ((element_id IS NULL) AND (scene_id IS NOT NULL))))
);


ALTER TABLE public.comments OWNER TO postgres;

--
-- Name: lanes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lanes (
    lane_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    color character varying(20) NOT NULL,
    lane_order integer NOT NULL
);


ALTER TABLE public.lanes OWNER TO postgres;

--
-- Name: outline_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.outline_items (
    outline_item_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    beat_id uuid NOT NULL,
    lane_id uuid NOT NULL,
    item_order integer NOT NULL,
    timeline_position double precision,
    width double precision
);


ALTER TABLE public.outline_items OWNER TO postgres;

--
-- Name: project_collaborators; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.project_collaborators (
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(50) DEFAULT 'Editor'::character varying NOT NULL,
    status boolean,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.project_collaborators OWNER TO postgres;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.projects (
    project_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    project_name character varying(255) NOT NULL,
    description text,
    is_starred boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.projects OWNER TO postgres;

--
-- Name: scenes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scenes (
    scene_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    act_id uuid,
    scene_number integer NOT NULL,
    setting text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    project_id uuid
);


ALTER TABLE public.scenes OWNER TO postgres;

--
-- Name: script_elements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.script_elements (
    element_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    scene_id uuid NOT NULL,
    element_order integer NOT NULL,
    element_type public.element_type NOT NULL,
    content text NOT NULL,
    character_id uuid
);


ALTER TABLE public.script_elements OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    user_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    username character varying(50) NOT NULL,
    username_tag character(5) NOT NULL,
    name character varying(255) NOT NULL,
    last_name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Data for Name: acts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.acts (act_id, project_id, act_number, title) FROM stdin;
5ed33dc0-cfce-40fa-82f1-619c47a2f2ed	96db33bf-d5d9-4f55-9e2e-dea866374a22	1	The Setup
e80c86f4-5603-40d7-b871-b229ae8af200	979832c1-e4d9-46d4-9dcd-2d34e12a86db	1	Act I
0eff75b2-bb27-47f5-926c-24ce5cebc4b5	2219b912-4924-4d2b-9d35-9b8704339114	1	Act I
\.


--
-- Data for Name: beat_connections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.beat_connections (connection_id, project_id, from_beat_id, to_beat_id, from_side, to_side) FROM stdin;
\.


--
-- Data for Name: beats; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.beats (beat_id, project_id, title, description, scene_numbers, color, position_x, position_y, width, height, act_number, beat_order) FROM stdin;
3d884df6-e56d-422a-86f5-ddb511bce2de	96db33bf-d5d9-4f55-9e2e-dea866374a22	Second Lane	shkjsdf	Pg X-Y	#f1f5f9	1360	280	240	160	1	1
11830ebe-eaba-4aa3-90df-cb707a34ff86	96db33bf-d5d9-4f55-9e2e-dea866374a22	Coffe Shop	They go to coffee shop	Pg X-Y	#ecfdf5	1440	60	288	192	1	4
f41d4979-573c-4c14-85c1-7f8b7aeed1dc	96db33bf-d5d9-4f55-9e2e-dea866374a22	Second Lane	Describe what happens...	Pg.20-25	#fef3c7	380	20	288	192	0	0
8ffca21d-5f11-4ebb-a100-11ef782f9629	96db33bf-d5d9-4f55-9e2e-dea866374a22	This is the second beat	This is my second beaaat	Pg.1-5	#fce7f3	120	320	380	180	1	3
51cab12d-dbd9-4abb-b9fd-ffe584b47ba0	96db33bf-d5d9-4f55-9e2e-dea866374a22	First Beat E	This is my first beat	Pg.1-5	#fee2e2	840	60	260	160	2	1
a2385527-8fcb-4366-8b50-9ff797be21cc	96db33bf-d5d9-4f55-9e2e-dea866374a22	First Lane	This is just a test beat	Pg X-Y	#dcfce7	40	40	260	200	1	0
0a42c77a-1eec-408c-892b-86abaefd98af	96db33bf-d5d9-4f55-9e2e-dea866374a22	New Beat	This is a new beat	Pg X-Y	#dcfce7	960	320	288	192	1	2
\.


--
-- Data for Name: characters; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.characters (character_id, project_id, character_name, description) FROM stdin;
98c7fb3d-a642-4529-acae-a333449370cf	96db33bf-d5d9-4f55-9e2e-dea866374a22	JANE	30s, confident, always one step ahead.
\.


--
-- Data for Name: comments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.comments (comment_id, element_id, user_id, content, is_resolved, created_at, updated_at, scene_id) FROM stdin;
80c58b30-d56d-43f6-b3ef-bcc257b85d5c	0b50eb91-27c4-4034-a800-f21bf54be227	492dd000-65cb-4724-bc74-292f79fe2d7a	This has a comment now, edited	t	2025-07-27 21:18:58.022398+00	2025-07-28 21:15:32.492096+00	\N
3ffb427e-e2e6-45d7-beab-ecfb7307a193	0b50eb91-27c4-4034-a800-f21bf54be227	492dd000-65cb-4724-bc74-292f79fe2d7a	Add a new one	f	2025-07-28 21:15:28.530296+00	2025-07-28 21:15:48.356378+00	\N
ec143eb0-d748-43fe-b289-956b02886fa0	0b50eb91-27c4-4034-a800-f21bf54be227	492dd000-65cb-4724-bc74-292f79fe2d7a	This is a new comment, it works	f	2025-07-28 20:07:13.863431+00	2025-08-24 09:14:32.176515+00	\N
5f0ff614-5b8b-416b-ae12-f9339f2e2230	\N	492dd000-65cb-4724-bc74-292f79fe2d7a	Maybe this should be night or mid day ?	t	2025-08-24 19:07:40.726577+00	2025-08-24 19:08:39.046129+00	589e7585-3a30-46dc-92e2-bb5b2926639d
e44e2795-7a5c-4f70-a68b-ed89048acd3f	\N	492dd000-65cb-4724-bc74-292f79fe2d7a	We are adding content, edited	t	2025-07-27 21:18:31.075054+00	2025-09-04 19:11:09.084033+00	589e7585-3a30-46dc-92e2-bb5b2926639d
67019923-0da0-4077-9293-ff21ea6f2c40	\N	492dd000-65cb-4724-bc74-292f79fe2d7a	Comment 	t	2025-09-03 16:32:13.521378+00	2025-09-04 19:11:12.861072+00	589e7585-3a30-46dc-92e2-bb5b2926639d
5a8b9a97-5e7f-4225-9fd8-1b5c8372481f	\N	492dd000-65cb-4724-bc74-292f79fe2d7a	Maybe not coffee shop ?	f	2025-09-04 20:10:47.128229+00	2025-09-04 20:10:47.128229+00	589e7585-3a30-46dc-92e2-bb5b2926639d
ee44d07a-ed70-42a6-a795-7e49242f169b	\N	492dd000-65cb-4724-bc74-292f79fe2d7a	New Comment 2	t	2025-09-04 19:00:55.78713+00	2025-09-04 20:10:49.341827+00	589e7585-3a30-46dc-92e2-bb5b2926639d
631ead25-6cb5-421b-8ea9-8f8938c62fbf	\N	492dd000-65cb-4724-bc74-292f79fe2d7a	Make this 	f	2025-09-04 19:11:05.937242+00	2025-09-04 20:11:00.182732+00	589e7585-3a30-46dc-92e2-bb5b2926639d
\.


--
-- Data for Name: lanes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.lanes (lane_id, project_id, name, color, lane_order) FROM stdin;
9c39fa50-ae5d-47ae-9cff-1624e2a56ec5	96db33bf-d5d9-4f55-9e2e-dea866374a22	Main	#e5e7eb	0
94ed31c3-61b1-442e-b000-9f11cc84e880	96db33bf-d5d9-4f55-9e2e-dea866374a22	Sub Plot	#e5e7eb	1
37efdc97-2916-41d1-9a62-d583fa1d78a2	96db33bf-d5d9-4f55-9e2e-dea866374a22	Newww	#e5e7eb	2
35089f56-49e4-45b7-98e8-e06751a3848b	96db33bf-d5d9-4f55-9e2e-dea866374a22	New Lane	#e5e7eb	3
\.


--
-- Data for Name: outline_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.outline_items (outline_item_id, project_id, beat_id, lane_id, item_order, timeline_position, width) FROM stdin;
0ffba08e-89c3-4eab-b4ad-00f4b89703cf	96db33bf-d5d9-4f55-9e2e-dea866374a22	51cab12d-dbd9-4abb-b9fd-ffe584b47ba0	9c39fa50-ae5d-47ae-9cff-1624e2a56ec5	1	17.604166666666668	34.166666666666664
da107b55-1bb2-4ef1-b8e7-84c270d07b95	96db33bf-d5d9-4f55-9e2e-dea866374a22	3d884df6-e56d-422a-86f5-ddb511bce2de	94ed31c3-61b1-442e-b000-9f11cc84e880	1	16.979166666666668	8.041666666666664
5c77d24a-5837-4249-b23a-f84309946cef	96db33bf-d5d9-4f55-9e2e-dea866374a22	f41d4979-573c-4c14-85c1-7f8b7aeed1dc	94ed31c3-61b1-442e-b000-9f11cc84e880	2	8.645833333333334	7.9375000000000036
eda2c6ec-fea6-44bc-bb46-1f353f604708	96db33bf-d5d9-4f55-9e2e-dea866374a22	0a42c77a-1eec-408c-892b-86abaefd98af	37efdc97-2916-41d1-9a62-d583fa1d78a2	0	21.145833333333332	15.208333333333332
cb41a97b-e7cf-4230-8cf2-a83a6bb457ee	96db33bf-d5d9-4f55-9e2e-dea866374a22	a2385527-8fcb-4366-8b50-9ff797be21cc	9c39fa50-ae5d-47ae-9cff-1624e2a56ec5	0	0	17.083333333333332
c3fe71cb-d561-49ab-8cff-eb1e604417ef	96db33bf-d5d9-4f55-9e2e-dea866374a22	f41d4979-573c-4c14-85c1-7f8b7aeed1dc	94ed31c3-61b1-442e-b000-9f11cc84e880	0	0	8.125
\.


--
-- Data for Name: project_collaborators; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.project_collaborators (project_id, user_id, role, status, created_at, updated_at) FROM stdin;
89ed34be-c65c-45f4-9ef2-205a45feaffb	4c962283-396e-4c35-b5bc-4f69fd2e2b9f	Editor	t	2025-06-29 00:00:00+00	2025-09-03 00:00:00+00
5e7e90f3-a03d-4160-a408-a4ac5cf5694c	492dd000-65cb-4724-bc74-292f79fe2d7a	Editor	t	2025-06-29 00:00:00+00	2025-09-04 00:00:00+00
2558401d-7b8c-4c09-a9de-316b2e5b1547	492dd000-65cb-4724-bc74-292f79fe2d7a	REVIEWER	t	2025-06-29 00:00:00+00	2025-09-04 00:00:00+00
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.projects (project_id, user_id, project_name, description, is_starred, created_at, updated_at) FROM stdin;
49fbeab3-137c-474a-a67a-4963ab52fd1f	492dd000-65cb-4724-bc74-292f79fe2d7a	The sunset	Short Film	f	2025-06-29 13:45:14.600227+00	2025-06-29 13:48:51.62263+00
5e7e90f3-a03d-4160-a408-a4ac5cf5694c	4c962283-396e-4c35-b5bc-4f69fd2e2b9f	Palm View	Documentary	f	2025-06-29 14:19:50.168207+00	2025-06-29 14:19:50.168207+00
979832c1-e4d9-46d4-9dcd-2d34e12a86db	492dd000-65cb-4724-bc74-292f79fe2d7a	Seaside	Feature Film	t	2025-06-29 14:13:52.83775+00	2025-07-28 21:17:29.718185+00
89ed34be-c65c-45f4-9ef2-205a45feaffb	492dd000-65cb-4724-bc74-292f79fe2d7a	Cool Project	Short Film	t	2025-07-17 16:59:33.059625+00	2025-08-16 20:32:34.294829+00
2558401d-7b8c-4c09-a9de-316b2e5b1547	4c962283-396e-4c35-b5bc-4f69fd2e2b9f	Apple Juice	Short Film	f	2025-08-24 18:56:42.448428+00	2025-08-24 18:56:42.448428+00
75c73463-a957-4665-8144-71aefa8fb27b	4c962283-396e-4c35-b5bc-4f69fd2e2b9f	Koffee	Documentary	f	2025-08-24 18:57:48.087816+00	2025-08-24 18:59:20.286626+00
2219b912-4924-4d2b-9d35-9b8704339114	492dd000-65cb-4724-bc74-292f79fe2d7a	Project 	TV Pilot	t	2025-07-17 16:29:02.479511+00	2025-09-04 19:10:23.846018+00
96db33bf-d5d9-4f55-9e2e-dea866374a22	492dd000-65cb-4724-bc74-292f79fe2d7a	Midnight Star	Documentary	t	2025-06-29 10:45:43.382653+00	2025-09-04 20:10:17.538215+00
bb573b50-aed2-4124-936c-25e591321e6e	a92baccc-49bd-44c4-a9f7-88f38a6fce94	AITest	Feature Film	f	2025-10-01 17:08:45.473935+00	2025-10-01 17:08:45.473935+00
\.


--
-- Data for Name: scenes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scenes (scene_id, act_id, scene_number, setting, created_at, updated_at, project_id) FROM stdin;
e9edd0a0-42b2-4a7d-9310-b0df62877b22	5ed33dc0-cfce-40fa-82f1-619c47a2f2ed	2	INT. OFFICE - LATER	2025-07-01 14:27:11.446336+00	2025-07-01 14:27:11.446336+00	96db33bf-d5d9-4f55-9e2e-dea866374a22
589e7585-3a30-46dc-92e2-bb5b2926639d	5ed33dc0-cfce-40fa-82f1-619c47a2f2ed	1	INT. COFFEE SHOP - DAY	2025-07-01 14:27:11.446336+00	2025-07-01 14:27:11.446336+00	96db33bf-d5d9-4f55-9e2e-dea866374a22
53e0317b-e92e-4722-9afb-4fd5ea626ca7	5ed33dc0-cfce-40fa-82f1-619c47a2f2ed	4	INT - ROOM - DAY	2025-07-27 14:54:39.441763+00	2025-07-27 14:54:39.441763+00	96db33bf-d5d9-4f55-9e2e-dea866374a22
fe0ba54f-95a8-4e1a-a21c-9383e8abdaf4	5ed33dc0-cfce-40fa-82f1-619c47a2f2ed	3	int - office - night	2025-07-26 19:43:12.808328+00	2025-07-26 19:43:12.808328+00	96db33bf-d5d9-4f55-9e2e-dea866374a22
e08f82cf-862d-4e72-8cc9-b10f9ef9edcf	0eff75b2-bb27-47f5-926c-24ce5cebc4b5	1	int. scene - later	2025-09-03 14:29:02.404166+00	2025-09-03 14:29:02.404166+00	2219b912-4924-4d2b-9d35-9b8704339114
8bd3a709-1910-4869-84e7-0b4bbc341c1f	e80c86f4-5603-40d7-b871-b229ae8af200	1	INT. COFFEE SHOP - DAY	2025-09-03 13:16:31.163836+00	2025-09-03 13:16:31.163836+00	979832c1-e4d9-46d4-9dcd-2d34e12a86db
\.


--
-- Data for Name: script_elements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.script_elements (element_id, scene_id, element_order, element_type, content, character_id) FROM stdin;
f8f21e73-c035-4eb8-b7eb-edbca94af102	589e7585-3a30-46dc-92e2-bb5b2926639d	7	TRANSITION	CUT TO:	\N
69eb0c59-fefa-4565-bf33-30affa5522ab	fe0ba54f-95a8-4e1a-a21c-9383e8abdaf4	3	DIALOG	This is the dialog of Jane&nbsp;	\N
d67d483b-dc14-48bd-9e52-eecf90e2e14e	53e0317b-e92e-4722-9afb-4fd5ea626ca7	6	DIALOG	This is puhizas dialog	\N
adb39bb7-f964-4570-ae68-0e423e91907d	e9edd0a0-42b2-4a7d-9310-b0df62877b22	5	CHARACTER	JANE	98c7fb3d-a642-4529-acae-a333449370cf
32097e7e-b55f-4d26-9562-a9a91a6b96f0	e9edd0a0-42b2-4a7d-9310-b0df62877b22	4	DIALOG	You're late. You're so late.	\N
bfdd5ca0-45b7-42d7-8bae-38fd53dd842b	e9edd0a0-42b2-4a7d-9310-b0df62877b22	7	DIALOG	Only fashionably. Did you get it?	98c7fb3d-a642-4529-acae-a333449370cf
65e4e071-c11e-4572-b33d-153f0c0c36d7	53e0317b-e92e-4722-9afb-4fd5ea626ca7	3	DIALOG	DIALOG	\N
b65943d5-9a4c-4867-aac5-c92c5094696d	53e0317b-e92e-4722-9afb-4fd5ea626ca7	5	CHARACTER	PUHIZA	\N
b954c0e9-0e97-4ba5-b1b9-cb442abec5b6	e9edd0a0-42b2-4a7d-9310-b0df62877b22	2	ACTION	The door opens. Jane enters, composed as ever.	\N
8293ca24-e85d-4aad-ae11-7831f8d0c869	e9edd0a0-42b2-4a7d-9310-b0df62877b22	10	PARENTHETICAL	(this is a parathentical)	\N
53deb28f-6429-4633-b4bf-0c6915094071	e9edd0a0-42b2-4a7d-9310-b0df62877b22	11	DIALOG	THis is a dialog	\N
4d6de19e-3926-49a7-9fa3-0a17b3cde0a6	e9edd0a0-42b2-4a7d-9310-b0df62877b22	6	ACTION	Another act is here. Here is something	\N
e4667fcf-109d-473d-a1f7-5c9611620831	e9edd0a0-42b2-4a7d-9310-b0df62877b22	12	CHARACTER	NAME	\N
15de42b7-133e-43c6-9ae1-6fe2addc2001	e9edd0a0-42b2-4a7d-9310-b0df62877b22	15	ACTION	THIS IS AN Aactionnnn	\N
d107a57a-b626-470c-b779-485e073a96f2	53e0317b-e92e-4722-9afb-4fd5ea626ca7	7	ACTION	THIS IS THE ACTION	\N
6e10d0bc-235d-4317-8312-cf4474e6b67e	e9edd0a0-42b2-4a7d-9310-b0df62877b22	17	ACTION	This is another action element	\N
41b1cc09-378a-42f7-9b9d-8b6a44c7b82c	e9edd0a0-42b2-4a7d-9310-b0df62877b22	14	ACTION	This is another action	\N
ed3a855f-5e9c-4121-964c-3b2868879516	e9edd0a0-42b2-4a7d-9310-b0df62877b22	13	DIALOG	THIS IS A DIALOG	\N
39fb1bb8-f9c5-4def-a2a2-7ad5fd7e0c49	e9edd0a0-42b2-4a7d-9310-b0df62877b22	9	CHARACTER	JANE	\N
f62e179d-d77f-42f1-ba53-cfe0da761b1d	53e0317b-e92e-4722-9afb-4fd5ea626ca7	2	ACTION	Hello, how are you&nbsp;	\N
8672d832-0b9f-45de-aada-50007170555b	53e0317b-e92e-4722-9afb-4fd5ea626ca7	10	ACTION	I am writeing	\N
41123a86-3a5a-46a2-93bd-a3ad0985a1d2	53e0317b-e92e-4722-9afb-4fd5ea626ca7	11	ACTION		\N
85dd526e-4879-4615-8060-ed24fa3310ea	589e7585-3a30-46dc-92e2-bb5b2926639d	5	DIALOG	I'll be there in five minutes. Don't start without me.	98c7fb3d-a642-4529-acae-a333449370cf
7bf99b15-dbfc-4df1-9bdb-636ec5f7d2e2	53e0317b-e92e-4722-9afb-4fd5ea626ca7	12	CHARACTER	char	\N
164e9cf0-8fe6-4b65-8fc1-711c80d0a1c9	53e0317b-e92e-4722-9afb-4fd5ea626ca7	14	ACTION	jksaldkjas	\N
9fc28fe9-9aa8-4ba9-a8d9-e28d39848a8e	e9edd0a0-42b2-4a7d-9310-b0df62877b22	8	ACTION	&nbsp;This is a new component&nbsp;	\N
acb66e12-32b4-4e54-a8a5-af7cbe328c55	e9edd0a0-42b2-4a7d-9310-b0df62877b22	16	TRANSITION	CUT TO:	\N
f20bdbc5-63fc-43d3-b1b7-cb95efb71092	589e7585-3a30-46dc-92e2-bb5b2926639d	4	PARENTHETICAL	(into phone)	98c7fb3d-a642-4529-acae-a333449370cf
589ee9b7-f8fb-4508-b23d-f150380118bf	53e0317b-e92e-4722-9afb-4fd5ea626ca7	13	DIALOG	<br>	\N
25065b0f-b113-43aa-8115-94b15c24f8b0	fe0ba54f-95a8-4e1a-a21c-9383e8abdaf4	1	ACTION	This is the first element to be inserted	\N
bc7254d0-22b4-4161-9fa9-dd62022276d8	fe0ba54f-95a8-4e1a-a21c-9383e8abdaf4	2	CHARACTER	JANE&nbsp;	\N
c95dc5d3-8407-4f0f-beff-6a9978f0a460	589e7585-3a30-46dc-92e2-bb5b2926639d	8	ACTION	Here we have an empty action i am typing	\N
dd53e732-8e17-4ea7-ac67-f445bc2eb590	e9edd0a0-42b2-4a7d-9310-b0df62877b22	3	CHARACTER	MARK	\N
8a801217-e7d4-4482-9dce-3d617a2eba49	589e7585-3a30-46dc-92e2-bb5b2926639d	1	ACTION	A busy downtown street. People hurry past each other, lost in their own worlds.	\N
e7d38c32-528c-4c9b-9d96-ed4cfa924cea	589e7585-3a30-46dc-92e2-bb5b2926639d	11	ACTION	THis is a new actio nlone	\N
8fa5e463-a990-44b8-8608-8668daeed09a	53e0317b-e92e-4722-9afb-4fd5ea626ca7	1	CHARACTER	JANE	\N
08abcc9e-ccdf-45b2-8b26-b5d9bd6889a6	53e0317b-e92e-4722-9afb-4fd5ea626ca7	9	SHOT	THIS IS&nbsp;	\N
fb9be7aa-360b-4be3-97e9-4019fdd44071	589e7585-3a30-46dc-92e2-bb5b2926639d	6	ACTION	She hangs up and quickens her pace, disappearing into the throng. Hello there this is a dialog just to see how this&nbsp;	\N
f61450e2-8038-47c2-a37d-d7ccff7f2774	e9edd0a0-42b2-4a7d-9310-b0df62877b22	1	ACTION	A sterile, modern office. MARK (40s, anxious) paces by a large window overlooking the city. The city	\N
0b50eb91-27c4-4034-a800-f21bf54be227	589e7585-3a30-46dc-92e2-bb5b2926639d	2	ACTION	JANE strides purposefully through the crowd, phone pressed to her ear.	\N
a25819f4-55b6-40da-97c8-34f6eb6ded0d	589e7585-3a30-46dc-92e2-bb5b2926639d	10	ACTION	This is another actionm&nbsp;	\N
f0ab26fb-e2e7-4167-990e-44dfdff10008	589e7585-3a30-46dc-92e2-bb5b2926639d	9	ACTION	This is another action	\N
bc9d0d2f-b532-4b18-9d5b-f8a16235f41d	589e7585-3a30-46dc-92e2-bb5b2926639d	3	CHARACTER	JANE	98c7fb3d-a642-4529-acae-a333449370cf
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (user_id, username, username_tag, name, last_name, email, password, created_at, updated_at) FROM stdin;
492dd000-65cb-4724-bc74-292f79fe2d7a	l1roii	13576	Lirianë	Berisha	lira@hotmail.com	$2a$10$DzjhUTF8nppIHy8BZqM2KeWpyUlBccQYhJwn9wryd3Rk80zk0/uS.	2025-06-28 16:07:27.605028+00	2025-06-28 16:07:27.605028+00
4c962283-396e-4c35-b5bc-4f69fd2e2b9f	loni	41218	Leon	Berisha	leon@hotmail.com	$2a$10$45yhm/VzG1aP23dYslA42uTWvTu.ckwr0Q/SpABaYHaFsSlap3h2e	2025-06-29 14:18:24.149797+00	2025-06-29 14:18:24.149797+00
a92baccc-49bd-44c4-a9f7-88f38a6fce94	puhizar	97816	Puhiza	RExha	puhiza@gmail.com	$2a$10$z8xDw02UMqyrUv64irQlUeoOLqf1ib./bdtHBz7GRga8yvDj.DjqG	2025-10-01 17:08:16.558232+00	2025-10-01 17:08:16.558232+00
\.


--
-- Name: acts acts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.acts
    ADD CONSTRAINT acts_pkey PRIMARY KEY (act_id);


--
-- Name: acts acts_project_id_act_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.acts
    ADD CONSTRAINT acts_project_id_act_number_key UNIQUE (project_id, act_number);


--
-- Name: beat_connections beat_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beat_connections
    ADD CONSTRAINT beat_connections_pkey PRIMARY KEY (connection_id);


--
-- Name: beats beats_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beats
    ADD CONSTRAINT beats_pkey PRIMARY KEY (beat_id);


--
-- Name: characters characters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_pkey PRIMARY KEY (character_id);


--
-- Name: characters characters_project_id_character_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_project_id_character_name_key UNIQUE (project_id, character_name);


--
-- Name: lanes lanes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lanes
    ADD CONSTRAINT lanes_pkey PRIMARY KEY (lane_id);


--
-- Name: comments notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT notes_pkey PRIMARY KEY (comment_id);


--
-- Name: outline_items outline_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.outline_items
    ADD CONSTRAINT outline_items_pkey PRIMARY KEY (outline_item_id);


--
-- Name: project_collaborators project_collaborators_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_pkey PRIMARY KEY (project_id, user_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (project_id);


--
-- Name: scenes scenes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scenes
    ADD CONSTRAINT scenes_pkey PRIMARY KEY (scene_id);


--
-- Name: scenes scenes_project_act_scene_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scenes
    ADD CONSTRAINT scenes_project_act_scene_number_key UNIQUE (project_id, act_id, scene_number);


--
-- Name: script_elements script_elements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.script_elements
    ADD CONSTRAINT script_elements_pkey PRIMARY KEY (element_id);


--
-- Name: script_elements script_elements_scene_id_element_order_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.script_elements
    ADD CONSTRAINT script_elements_scene_id_element_order_key UNIQUE (scene_id, element_order);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: users users_username_username_tag_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_username_tag_key UNIQUE (username, username_tag);


--
-- Name: acts_project_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX acts_project_id_idx ON public.acts USING btree (project_id);


--
-- Name: beat_connections_project_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX beat_connections_project_id_idx ON public.beat_connections USING btree (project_id);


--
-- Name: beats_project_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX beats_project_id_idx ON public.beats USING btree (project_id);


--
-- Name: characters_project_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX characters_project_id_idx ON public.characters USING btree (project_id);


--
-- Name: lanes_project_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX lanes_project_id_idx ON public.lanes USING btree (project_id);


--
-- Name: notes_element_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX notes_element_id_idx ON public.comments USING btree (element_id);


--
-- Name: notes_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX notes_user_id_idx ON public.comments USING btree (user_id);


--
-- Name: outline_items_project_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX outline_items_project_id_idx ON public.outline_items USING btree (project_id);


--
-- Name: project_collaborators_project_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX project_collaborators_project_id_idx ON public.project_collaborators USING btree (project_id);


--
-- Name: project_collaborators_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX project_collaborators_user_id_idx ON public.project_collaborators USING btree (user_id);


--
-- Name: projects_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX projects_user_id_idx ON public.projects USING btree (user_id);


--
-- Name: scenes_act_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scenes_act_id_idx ON public.scenes USING btree (act_id);


--
-- Name: script_elements_character_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX script_elements_character_id_idx ON public.script_elements USING btree (character_id);


--
-- Name: script_elements_scene_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX script_elements_scene_id_idx ON public.script_elements USING btree (scene_id);


--
-- Name: acts acts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.acts
    ADD CONSTRAINT acts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;


--
-- Name: beat_connections beat_connections_from_beat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beat_connections
    ADD CONSTRAINT beat_connections_from_beat_id_fkey FOREIGN KEY (from_beat_id) REFERENCES public.beats(beat_id) ON DELETE CASCADE;


--
-- Name: beat_connections beat_connections_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beat_connections
    ADD CONSTRAINT beat_connections_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;


--
-- Name: beat_connections beat_connections_to_beat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beat_connections
    ADD CONSTRAINT beat_connections_to_beat_id_fkey FOREIGN KEY (to_beat_id) REFERENCES public.beats(beat_id) ON DELETE CASCADE;


--
-- Name: beats beats_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beats
    ADD CONSTRAINT beats_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;


--
-- Name: characters characters_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;


--
-- Name: comments comments_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.scenes(scene_id) ON DELETE CASCADE;


--
-- Name: lanes lanes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lanes
    ADD CONSTRAINT lanes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;


--
-- Name: comments notes_element_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT notes_element_id_fkey FOREIGN KEY (element_id) REFERENCES public.script_elements(element_id) ON DELETE CASCADE;


--
-- Name: comments notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: outline_items outline_items_beat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.outline_items
    ADD CONSTRAINT outline_items_beat_id_fkey FOREIGN KEY (beat_id) REFERENCES public.beats(beat_id) ON DELETE CASCADE;


--
-- Name: outline_items outline_items_lane_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.outline_items
    ADD CONSTRAINT outline_items_lane_id_fkey FOREIGN KEY (lane_id) REFERENCES public.lanes(lane_id) ON DELETE CASCADE;


--
-- Name: outline_items outline_items_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.outline_items
    ADD CONSTRAINT outline_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;


--
-- Name: project_collaborators project_collaborators_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;


--
-- Name: project_collaborators project_collaborators_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: projects projects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: scenes scenes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scenes
    ADD CONSTRAINT scenes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;


--
-- Name: script_elements script_elements_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.script_elements
    ADD CONSTRAINT script_elements_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(character_id) ON DELETE SET NULL;


--
-- Name: script_elements script_elements_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.script_elements
    ADD CONSTRAINT script_elements_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.scenes(scene_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

