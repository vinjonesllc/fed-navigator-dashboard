-- Fed Navigator — reset the client brand CHECK constraint to the full allowed
-- list. Supersedes 0007/0008: fixes "Feducate DMV" (0008 was never applied) and
-- adds "FedRetire SME" + "Fed Ret Inst". Idempotent.

alter table clients drop constraint if exists clients_brand_check;
alter table clients add constraint clients_brand_check
  check (brand in (
    'Fed Pilot',
    'Feducate',
    'Feducate DMV',
    'MyFedNav',
    'FedRetire SME',
    'Fed Ret Inst'
  ));
