-- Advisor's next-workshop registration page URL. Edited in the client's
-- Next Workshop settings and synced to ActiveCampaign as the "Advisor Reg Page
-- URL" custom field (%ADVISOR_REG_PAGE_URL%) when attendees are uploaded.
alter table clients
  add column if not exists next_workshop_reg_url text;
