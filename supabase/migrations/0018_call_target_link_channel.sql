-- Records how the booking link was delivered (text vs email) so the Part 2 page
-- can report the channel split. Set in the send_booking_link tool handler.
alter table call_targets add column if not exists link_channel text
  check (link_channel is null or link_channel in ('text', 'email'));
