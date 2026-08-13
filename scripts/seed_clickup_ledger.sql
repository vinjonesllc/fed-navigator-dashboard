-- Baseline seed for part2_booking_notifications. Run in the Supabase SQL editor AFTER migration 0025.
-- Records the bookings ClickUp was already told about (plus yesterday's 8, which are being handled
-- manually) so the reconciler does not re-post them. Idempotent: ON CONFLICT DO NOTHING.
insert into part2_booking_notifications (event_ref, full_name, email, event_time, source, notified_at) values
  ('https://api.calendly.com/scheduled_events/c158d1ec-4ba2-41c0-909c-4d00ff2e7059/invitees/0f1b4e79-f14d-40f3-a0b2-f61936dc2232', 'Trina Street', 'trina.street@nasa.gov', '2026-08-14T21:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/5d6c7333-031e-490e-88f8-614b98f317e5/invitees/15d5eae0-8409-4f03-90a4-595fd5de1672', 'Dennis Hannibal', 'jenniferlewis65@gmail.com', '2026-08-17T12:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/4909b929-d7ab-4ae7-9e3c-e9998bfc96d4/invitees/2cb4d6af-b0bc-4de0-a588-0b9c17251a18', 'Angela Lindstrom', 'angela.lindstrom@occ.treas.gov', '2026-08-17T17:30:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/63ae1667-e63b-456b-94fe-814d70cdf331/invitees/a1b6a331-29c6-42f7-8332-74e091c81a98', 'Erin Gray', 'erin.gray3@va.gov', '2026-08-18T13:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/b05310a4-51a6-483e-9546-0b8c81517e0d/invitees/3baa39f4-00d7-46bf-ad25-6015875e258a', 'Ben Sellari', 'bsellari@comcast.net', '2026-08-18T23:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/53dbd047-f2ad-4603-bb77-43601a49ec1c/invitees/c9ca1797-97a2-4bb0-8cab-a32afd684129', 'Robin Smith', 'robin.smith@fema.dhs.gov', '2026-08-19T20:30:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/6271ced3-620f-49d4-b34e-49fb0c81ea6a/invitees/decbfb45-b6d1-4921-8e43-ad90b4897daa', 'Cindy Workman', 'cinanmin@hotmail.co.uk', '2026-08-21T16:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/a3a72150-345f-43ed-83be-6a28d29ce280/invitees/6f7edf5a-7600-462b-843e-6bd2f7a4572b', 'Deborah Medley', 'deborah.medley@va.gov', '2026-08-21T18:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/4b62c832-1d0d-4fe7-9a7d-6694f6a7c731/invitees/cb87056f-fd81-4ea7-97f4-b74d27408a1a', 'Ginger Hunt', 'ginger.hunt@att.net', '2026-08-24T12:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/d78f4e08-5875-4bb9-9227-901d70b39568/invitees/7b9e919b-1dc7-4984-8a03-14389dabddbb', 'Teresa Kohart', 'teresa.kohart@ihs.gov', '2026-08-24T13:30:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/96badf46-31a6-4aba-bf31-6fd110da4d41/invitees/a603d5e6-0662-464d-befb-21b88430fb65', 'Jonni Larson', 'jonni.larson@va.gov', '2026-08-25T17:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/6061ea7b-9162-475f-af91-45dd73fea75f/invitees/7c2f0b5a-28a9-4d05-aa7b-46487e4885eb', 'Lisa Joseph', 'lisamarie.jo91@gmail.com', '2026-08-26T14:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/b2d95b81-e246-4c38-98be-bd25d288080c/invitees/f6a84807-29ff-4efb-93eb-bde46978c765', 'Laura Hofer', 'laura.hofer@va.gov', '2026-08-26T17:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/3aaffbfb-440b-47bf-85ca-5d9fc55862f2/invitees/e2b943e2-2baf-4557-8919-27406264e16a', 'Sonya Chapman', 'sonya.chapman@va.gov', '2026-08-27T15:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/f8b29bd5-4688-4c69-9fea-1802f1993284/invitees/a8cfbf3f-d16d-443a-bfc0-d92896cb62bb', 'Leanne "Shelli" Smalling', 'lby0@cdc.gov', '2026-08-28T13:30:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/3afad721-fd80-4cb4-a36a-bf490e20ee4b/invitees/c9b3eee5-5869-43ea-8480-f5c245b6db4c', 'CONRAD HARROW', 'vjq4@cdc.gov', '2026-08-28T18:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/68d8f1f1-5ab7-4beb-a72f-774135dbfa86/invitees/202dfcd5-7ad5-4aa1-a361-98b7ad644f53', 'Kim Broom', 'kim.broom@va.gov', '2026-08-28T19:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/c30a1f0a-0a95-4117-b27b-fa1f898ce5ae/invitees/324c1806-6094-4c6f-9658-e7692f5708cc', 'Gregory Gray', 'pure.genuinely@gmail.com', '2026-08-29T16:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/a07f3b5e-6f3d-4532-ba7c-cdcbb8a6cc12/invitees/5d9332c3-5eff-4f2f-9e1e-8fe876da165c', 'Brenda Grubb', 'brenda.grubb@va.gov', '2026-08-31T20:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/03b4069b-ccc9-4a00-80ba-1fbfed860c8f/invitees/7220822c-c77c-4efe-b9da-e63e05e6dcc3', 'Kande Moore', 'kandelmoore@gmail.com', '2026-09-04T15:30:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/10e67a9e-e068-4238-9ab3-34fcdb83b945/invitees/5e5896b3-0b91-4175-af60-854dca0ceeff', 'Mohamad Fakhreddine', 'mohamad.fakhreddine@faa.gov', '2026-09-04T18:00:00.000000Z', 'seed', now()),
  ('https://api.calendly.com/scheduled_events/4fd18a6e-0516-442e-8adc-a204a6a11c57/invitees/7934f912-8070-4c81-ae9c-39195d2dea32', 'Alejandra O''Connor', 'alejandra.oconnor@gmail.com', '2026-09-12T17:00:00.000000Z', 'seed', now())
on conflict (event_ref) do nothing;
