import type { TreeFamily, TreePerson } from '@/stores/canvasStore';

function p(
  id: string,
  given: string,
  surname: string,
  sex: TreePerson['sex'],
  birth: string | null,
  death: string | null = null,
): TreePerson {
  return {
    id,
    given_name: given,
    surname,
    sex,
    birth_date: birth,
    death_date: death,
    is_living: !death,
    is_private: false,
    photo_url: null,
  };
}

/** Small sample tree with a remarriage, half-siblings and cousins, for the prototype's ?demo=1 mode. */
export const DEMO_PERSONS: TreePerson[] = [
  p('gf1', 'George', 'Hart', 'M', '1920-04-02', '1991-08-11'),
  p('gm1', 'Edith', 'Hart', 'F', '1924-01-19', '2005-03-30'),
  p('gf2', 'Walter', 'Moss', 'M', '1918-06-30', '1980-12-01'),
  p('gm2', 'Ruth', 'Moss', 'F', '1921-09-09', '2010-02-14'),
  p('dad', 'Robert', 'Hart', 'M', '1948-05-21'),
  p('mom', 'Linda', 'Moss', 'F', '1950-10-03'),
  p('aunt', 'Carol', 'Hart', 'F', '1951-02-17'),
  p('uncle', 'Dan', 'Pike', 'M', '1949-07-07'),
  p('cousin', 'Beth', 'Pike', 'F', '1978-11-23'),
  p('stepmom', 'Susan', 'Reed', 'F', '1955-03-08'),
  p('me', 'Alex', 'Hart', 'U', '1976-06-14'),
  p('sis', 'Jamie', 'Hart', 'F', '1979-09-01'),
  p('halfbro', 'Tom', 'Hart', 'M', '1990-12-12'),
  p('spouse', 'Morgan', 'Lee', 'U', '1977-01-25'),
  p('kid1', 'Sam', 'Hart', 'M', '2005-04-04'),
  p('kid2', 'Riley', 'Hart', 'F', '2008-08-18'),
];

export const DEMO_FAMILIES: TreeFamily[] = [
  { id: 'fam-g1', spouse1_id: 'gf1', spouse2_id: 'gm1', children_ids: ['dad', 'aunt'], marriage_date: '1946-06-15' },
  { id: 'fam-g2', spouse1_id: 'gf2', spouse2_id: 'gm2', children_ids: ['mom'], marriage_date: '1947-05-10' },
  { id: 'fam-p1', spouse1_id: 'dad', spouse2_id: 'mom', children_ids: ['me', 'sis'], marriage_date: '1974-08-24' },
  { id: 'fam-p2', spouse1_id: 'dad', spouse2_id: 'stepmom', children_ids: ['halfbro'], marriage_date: '1988-09-03' },
  { id: 'fam-a', spouse1_id: 'uncle', spouse2_id: 'aunt', children_ids: ['cousin'], marriage_date: '1975-04-19' },
  { id: 'fam-me', spouse1_id: 'me', spouse2_id: 'spouse', children_ids: ['kid1', 'kid2'], marriage_date: '2003-10-11' },
];

export const DEMO_ROOT_ID = 'me';
