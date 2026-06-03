-- Fed Navigator — add "Feducate DMV" to the allowed client brands.

alter table clients drop constraint if exists clients_brand_check;
alter table clients add constraint clients_brand_check
  check (brand in ('Fed Pilot', 'Feducate', 'Feducate DMV', 'MyFedNav'));
